import type * as maplibregl from 'maplibre-gl'

export type MapTheme = 'light' | 'hud'

type PaintProperty = Parameters<maplibregl.Map['setPaintProperty']>[1]

// Mid-dark rather than near-black ground, so black shadows (3D shadow plane,
// 2D shadow layer) still read clearly on top of it.
const PALETTE = {
  land: '#18222c',
  landuse: '#172029',
  green: '#152620',
  water: '#0b2233',
  waterLine: '#0f3148',
  building: '#243241',
  buildingExtrusion: '#283a4c',
  road: '#2b3a49',
  roadMajor: '#34485c',
  line: '#223040',
  label: '#9fb3c6',
  labelHalo: '#0b121a',
}

function fillColor(id: string): string {
  if (/water|ocean|river|lake/.test(id)) return PALETTE.water
  if (/park|grass|wood|forest|green|garden|landcover|scrub|meadow/.test(id)) return PALETTE.green
  if (/building/.test(id)) return PALETTE.building
  if (/road|street|highway|motorway|bridge|tunnel|aeroway|pier/.test(id)) return PALETTE.road
  return PALETTE.landuse
}

function lineColor(id: string): string {
  if (/water|river|stream|canal/.test(id)) return PALETTE.waterLine
  if (/motorway|trunk|primary|major/.test(id)) return PALETTE.roadMajor
  if (/road|street|highway|path|track|rail|transit|bridge|tunnel|transportation/.test(id)) return PALETTE.road
  return PALETTE.line
}

/**
 * Recolor whatever basemap style is loaded to the command center's dark
 * palette, by layer type and id keywords (works with OpenFreeMap's
 * OpenMapTiles-based "liberty" without depending on exact layer ids).
 * Layers a property doesn't apply to are skipped individually.
 */
export function applyDarkBasemap(map: maplibregl.Map) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const id = layer.id.toLowerCase()
    const set = (prop: PaintProperty, value: string | number) => {
      try {
        map.setPaintProperty(layer.id, prop, value)
      } catch {
        // property not valid for this layer; leave it as styled
      }
    }
    switch (layer.type) {
      case 'background':
        set('background-color', PALETTE.land)
        break
      case 'fill':
        set('fill-color', fillColor(id))
        set('fill-outline-color', PALETTE.labelHalo)
        break
      case 'fill-extrusion':
        set('fill-extrusion-color', PALETTE.buildingExtrusion)
        break
      case 'line':
        set('line-color', lineColor(id))
        break
      case 'symbol':
        set('text-color', PALETTE.label)
        set('text-halo-color', PALETTE.labelHalo)
        set('text-halo-width', 1.2)
        set('icon-opacity', 0.75)
        break
    }
  }
}
