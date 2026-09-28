import * as maplibregl from 'maplibre-gl'
import type { BuildingsResponse, LatLon } from '../lib/api'

// Building shadows for the 2D map, computed on the GPU from real footprints
// and heights (/buildings-nearby) plus the sun position.
//
// Geometry: a prism's shadow on flat ground, outside its own footprint, is
// exactly the union of every footprint edge swept along the shadow offset
// (each edge -> a quad). The footprint itself is covered by the base map's
// building layer, which draws above this one. Each ring vertex is stored twice
// (base, and "top" with a flag), and the vertex shader moves the top copies by
// height * offset — so a new sun position only changes one uniform and the
// shadows follow the time slider at no CPU cost.
//
// Rendering: overlapping quads must not darken each other (a building's own
// quads overlap at corners, neighbours' shadows overlap everywhere), so the
// quads are drawn opaque into an offscreen mask (4x MSAA for smooth edges) in
// the offscreen pass, then composited once with a single, uniform alpha.

export const BUILDING_SHADOW_LAYER_ID = 'building-shadows'

// Same fallback as the 3D view uses for buildings without a height.
const DEFAULT_BUILDING_HEIGHT_M = 9
// Shadow length grows as 1/tan(altitude); clamp so dawn/dusk shadows stay
// bounded instead of stretching across the whole city.
const MIN_ALTITUDE_DEG = 2
// Fade shadows in/out over the last few degrees above the horizon instead of
// popping when the sun rises or sets.
const FADE_ALTITUDE_DEG = 5
const SHADOW_RGB: [number, number, number] = [15 / 255, 42 / 255, 64 / 255]
const SHADOW_ALPHA = 0.3

const MASK_VS = `#version 300 es
uniform mat4 u_matrix;
uniform vec2 u_offset;
in vec4 a_pos;
void main() {
  vec2 p = a_pos.xy + u_offset * a_pos.z * a_pos.w;
  gl_Position = u_matrix * vec4(p, 0.0, 1.0);
}`

const MASK_FS = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}`

const COMPOSITE_VS = `#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * 0.5 + 0.5;
  gl_Position = vec4(a_corner, 0.0, 1.0);
}`

const COMPOSITE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_mask;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = u_color * texture(u_mask, v_uv).r;
}`

interface BuildingGeometry {
  center: LatLon
  /** Rings in local units, closed ring duplicate removed. */
  rings: Float64Array[]
  height: number
}

export interface BuildingShadowLayer {
  layer: maplibregl.CustomLayerInterface
  addBuildings(features: BuildingsResponse['features']): void
  /** Drop buildings farther than `radiusM` from `center`, to keep memory bounded as the map roams. */
  pruneFarFrom(center: LatLon, radiusM: number): void
  size(): number
  setSun(altitudeDeg: number, azimuthDeg: number): void
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shadow layer shader: ${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shadow layer program: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

function distanceMeters(a: LatLon, b: LatLon): number {
  const dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  const dy = (b.lat - a.lat) * 111320
  return Math.hypot(dx, dy)
}

/**
 * `origin` is the fixed local-coordinate origin: vertices are stored as
 * meters-at-origin offsets from it (float32-safe), and the model matrix maps
 * them back to mercator exactly.
 */
export function createBuildingShadowLayer(origin: LatLon): BuildingShadowLayer {
  const originMerc = maplibregl.MercatorCoordinate.fromLngLat([origin.lon, origin.lat], 0)
  const scale = originMerc.meterInMercatorCoordinateUnits()

  const buildings = new Map<number, BuildingGeometry>()
  let geometryDirty = false
  let indexCount = 0
  let offset: [number, number] = [0, 0]
  let alpha = 0

  let map: maplibregl.Map | null = null
  let gl: WebGL2RenderingContext | null = null
  let maskProgram: WebGLProgram | null = null
  let compositeProgram: WebGLProgram | null = null
  let buildingVao: WebGLVertexArrayObject | null = null
  let vertexBuffer: WebGLBuffer | null = null
  let indexBuffer: WebGLBuffer | null = null
  let quadVao: WebGLVertexArrayObject | null = null
  let msaaFbo: WebGLFramebuffer | null = null
  let msaaRbo: WebGLRenderbuffer | null = null
  let resolveFbo: WebGLFramebuffer | null = null
  let maskTexture: WebGLTexture | null = null
  let targetWidth = 0
  let targetHeight = 0
  let maskReady = false

  function toLocal(lon: number, lat: number): [number, number] {
    const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0)
    return [(m.x - originMerc.x) / scale, -(m.y - originMerc.y) / scale]
  }

  function rebuildBuffers(context: WebGL2RenderingContext) {
    let vertexCount = 0
    let edgeCount = 0
    for (const b of buildings.values()) {
      for (const ring of b.rings) {
        const n = ring.length / 2
        vertexCount += n * 2
        edgeCount += n
      }
    }
    const vertices = new Float32Array(vertexCount * 4)
    const indices = new Uint32Array(edgeCount * 6)
    let v = 0
    let i = 0
    for (const b of buildings.values()) {
      for (const ring of b.rings) {
        const n = ring.length / 2
        const base = v
        for (let k = 0; k < n; k++) {
          const x = ring[k * 2]
          const y = ring[k * 2 + 1]
          vertices.set([x, y, b.height, 0, x, y, b.height, 1], v * 4)
          v += 2
        }
        for (let k = 0; k < n; k++) {
          const a0 = base + k * 2
          const b0 = base + ((k + 1) % n) * 2
          indices.set([a0, b0, b0 + 1, a0, b0 + 1, a0 + 1], i)
          i += 6
        }
      }
    }
    context.bindBuffer(context.ARRAY_BUFFER, vertexBuffer)
    context.bufferData(context.ARRAY_BUFFER, vertices, context.STATIC_DRAW)
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer)
    context.bufferData(context.ELEMENT_ARRAY_BUFFER, indices, context.STATIC_DRAW)
    indexCount = indices.length
    geometryDirty = false
  }

  function ensureTargets(context: WebGL2RenderingContext) {
    const width = context.drawingBufferWidth
    const height = context.drawingBufferHeight
    if (width === targetWidth && height === targetHeight && msaaFbo) return
    targetWidth = width
    targetHeight = height

    if (msaaRbo) context.deleteRenderbuffer(msaaRbo)
    if (msaaFbo) context.deleteFramebuffer(msaaFbo)
    if (maskTexture) context.deleteTexture(maskTexture)
    if (resolveFbo) context.deleteFramebuffer(resolveFbo)

    const samples = Math.min(4, context.getParameter(context.MAX_SAMPLES) as number)
    msaaRbo = context.createRenderbuffer()
    context.bindRenderbuffer(context.RENDERBUFFER, msaaRbo)
    context.renderbufferStorageMultisample(context.RENDERBUFFER, samples, context.RGBA8, width, height)
    msaaFbo = context.createFramebuffer()
    context.bindFramebuffer(context.FRAMEBUFFER, msaaFbo)
    context.framebufferRenderbuffer(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.RENDERBUFFER, msaaRbo)

    maskTexture = context.createTexture()
    context.bindTexture(context.TEXTURE_2D, maskTexture)
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    resolveFbo = context.createFramebuffer()
    context.bindFramebuffer(context.FRAMEBUFFER, resolveFbo)
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, maskTexture, 0)
    context.bindRenderbuffer(context.RENDERBUFFER, null)
  }

  /** mainMatrix (mercator -> clip) × model (local meters -> mercator), column-major. */
  function modelViewProjection(main: ArrayLike<number>): Float32Array {
    const out = new Float32Array(16)
    for (let r = 0; r < 4; r++) {
      out[r] = main[r] * scale
      out[4 + r] = main[4 + r] * -scale
      out[8 + r] = main[8 + r]
      out[12 + r] = main[r] * originMerc.x + main[4 + r] * originMerc.y + main[12 + r]
    }
    return out
  }

  const layer: maplibregl.CustomLayerInterface = {
    id: BUILDING_SHADOW_LAYER_ID,
    type: 'custom',
    renderingMode: '2d',

    onAdd(m, context) {
      map = m
      gl = context as WebGL2RenderingContext
      maskProgram = link(gl, MASK_VS, MASK_FS)
      compositeProgram = link(gl, COMPOSITE_VS, COMPOSITE_FS)

      vertexBuffer = gl.createBuffer()
      indexBuffer = gl.createBuffer()
      buildingVao = gl.createVertexArray()
      gl.bindVertexArray(buildingVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      const posLoc = gl.getAttribLocation(maskProgram, 'a_pos')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 4, gl.FLOAT, false, 16, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)

      quadVao = gl.createVertexArray()
      gl.bindVertexArray(quadVao)
      const quadBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const cornerLoc = gl.getAttribLocation(compositeProgram, 'a_corner')
      gl.enableVertexAttribArray(cornerLoc)
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0)
      gl.bindVertexArray(null)
      geometryDirty = true
    },

    prerender(context, options) {
      const c = context as WebGL2RenderingContext
      maskReady = false
      if (!maskProgram || alpha <= 0) return
      if (geometryDirty) {
        c.bindVertexArray(buildingVao)
        rebuildBuffers(c)
        c.bindVertexArray(null)
      }
      if (indexCount === 0) return

      ensureTargets(c)
      c.bindFramebuffer(c.FRAMEBUFFER, msaaFbo)
      c.viewport(0, 0, targetWidth, targetHeight)
      c.disable(c.BLEND)
      c.disable(c.DEPTH_TEST)
      c.disable(c.STENCIL_TEST)
      c.disable(c.CULL_FACE)
      c.disable(c.SCISSOR_TEST)
      c.colorMask(true, true, true, true)
      c.clearColor(0, 0, 0, 0)
      c.clear(c.COLOR_BUFFER_BIT)

      c.useProgram(maskProgram)
      c.uniformMatrix4fv(c.getUniformLocation(maskProgram, 'u_matrix'), false, modelViewProjection(options.defaultProjectionData.mainMatrix))
      c.uniform2f(c.getUniformLocation(maskProgram, 'u_offset'), offset[0], offset[1])
      c.bindVertexArray(buildingVao)
      c.drawElements(c.TRIANGLES, indexCount, c.UNSIGNED_INT, 0)
      c.bindVertexArray(null)

      c.bindFramebuffer(c.READ_FRAMEBUFFER, msaaFbo)
      c.bindFramebuffer(c.DRAW_FRAMEBUFFER, resolveFbo)
      c.blitFramebuffer(0, 0, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight, c.COLOR_BUFFER_BIT, c.NEAREST)
      c.bindFramebuffer(c.FRAMEBUFFER, null)
      maskReady = true
    },

    render(context) {
      if (!maskReady || !compositeProgram) return
      const c = context as WebGL2RenderingContext
      c.useProgram(compositeProgram)
      c.activeTexture(c.TEXTURE0)
      c.bindTexture(c.TEXTURE_2D, maskTexture)
      c.uniform1i(c.getUniformLocation(compositeProgram, 'u_mask'), 0)
      const a = SHADOW_ALPHA * alpha
      c.uniform4f(c.getUniformLocation(compositeProgram, 'u_color'), SHADOW_RGB[0] * a, SHADOW_RGB[1] * a, SHADOW_RGB[2] * a, a)
      c.enable(c.BLEND)
      c.blendFunc(c.ONE, c.ONE_MINUS_SRC_ALPHA)
      c.bindVertexArray(quadVao)
      c.drawArrays(c.TRIANGLES, 0, 3)
      c.bindVertexArray(null)
    },

    onRemove() {
      if (!gl) return
      gl.deleteProgram(maskProgram)
      gl.deleteProgram(compositeProgram)
      gl.deleteBuffer(vertexBuffer)
      gl.deleteBuffer(indexBuffer)
      gl.deleteVertexArray(buildingVao)
      gl.deleteVertexArray(quadVao)
      gl.deleteFramebuffer(msaaFbo)
      gl.deleteRenderbuffer(msaaRbo)
      gl.deleteFramebuffer(resolveFbo)
      gl.deleteTexture(maskTexture)
      msaaFbo = null
      map = null
      gl = null
    },
  }

  return {
    layer,

    addBuildings(features) {
      let added = false
      for (const feature of features) {
        const id = feature.properties?.id
        if (id == null || buildings.has(id)) continue
        const height = feature.properties?.height_m || DEFAULT_BUILDING_HEIGHT_M
        if (height <= 0) continue
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
        const rings: Float64Array[] = []
        let sumLon = 0
        let sumLat = 0
        let count = 0
        for (const polygon of polygons) {
          for (const ring of polygon) {
            const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
            const n = closed ? ring.length - 1 : ring.length
            if (n < 3) continue
            const local = new Float64Array(n * 2)
            for (let k = 0; k < n; k++) {
              const [x, y] = toLocal(ring[k][0], ring[k][1])
              local[k * 2] = x
              local[k * 2 + 1] = y
              sumLon += ring[k][0]
              sumLat += ring[k][1]
              count++
            }
            rings.push(local)
          }
        }
        if (rings.length === 0) continue
        buildings.set(id, { center: { lon: sumLon / count, lat: sumLat / count }, rings, height })
        added = true
      }
      if (added) {
        geometryDirty = true
        map?.triggerRepaint()
      }
    },

    pruneFarFrom(center, radiusM) {
      let removed = false
      for (const [id, b] of buildings) {
        if (distanceMeters(center, b.center) > radiusM) {
          buildings.delete(id)
          removed = true
        }
      }
      if (removed) {
        geometryDirty = true
        map?.triggerRepaint()
      }
    },

    size() {
      return buildings.size
    },

    setSun(altitudeDeg, azimuthDeg) {
      const nextAlpha = Math.min(1, Math.max(0, altitudeDeg / FADE_ALTITUDE_DEG))
      const lengthPerMeter = 1 / Math.tan((Math.max(altitudeDeg, MIN_ALTITUDE_DEG) * Math.PI) / 180)
      const az = (azimuthDeg * Math.PI) / 180
      // Shadows point away from the sun: local axes are x = east, y = north.
      offset = [-Math.sin(az) * lengthPerMeter, -Math.cos(az) * lengthPerMeter]
      alpha = nextAlpha
      map?.triggerRepaint()
    },
  }
}
