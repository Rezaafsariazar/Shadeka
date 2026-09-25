import { DEFAULT_TIME, TIME_MAX, TIME_MIN } from './time'

// Single source of truth for the simulated time of day, kept outside React
// so scrubbing or playback re-renders only the few components that subscribe
// (the slider, SunIndicator) instead of the whole app on every tick. The 3D
// sun and the 2D shadow layer subscribe imperatively and never re-render.
//
//  - target:  what the user selected (slider or playback), in minutes
//  - display: target smoothed per frame, which is what the sun/shadows render

// Time constant of the critically-damped smoothing. Short enough that the
// shadows feel attached to the slider thumb, long enough to glide over the
// 5-minute slider steps and uneven input-event timing instead of popping.
const SMOOTH_TIME_S = 0.18
const PLAY_RATE_MIN_PER_S = 20
// Reduced motion: playback jumps in discrete steps instead of sweeping.
const REDUCED_MOTION_STEP_MIN = 15
const REDUCED_MOTION_STEP_S = 0.75

export type PlaybackSpeed = 1 | 2 | 4

export interface PlaybackState {
  playing: boolean
  speed: PlaybackSpeed
}

type Listener = () => void

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Critically-damped spring toward `target` (the SmoothDamp formulation from
 * Game Programming Gems 4). Frame-rate independent, never overshoots, and
 * eases in and out, so a target that jumps (keyboard step, fast drag) still
 * produces a continuous glide.
 */
function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): [number, number] {
  const omega = 2 / smoothTime
  const x = omega * dt
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (velocity + omega * change) * dt
  let nextVelocity = (velocity - omega * temp) * decay
  let next = target + (change + temp) * decay
  if (target - current > 0 === next > target) {
    next = target
    nextVelocity = 0
  }
  return [next, nextVelocity]
}

function clampTime(minutes: number): number {
  return Math.min(TIME_MAX, Math.max(TIME_MIN, minutes))
}

class TimeStore {
  private target = DEFAULT_TIME
  private display = DEFAULT_TIME
  private velocity = 0
  private playback: PlaybackState = { playing: false, speed: 1 }
  private raf = 0
  private lastFrame = 0
  private reducedMotionAccum = 0
  private readonly targetListeners = new Set<Listener>()
  private readonly displayListeners = new Set<Listener>()
  private readonly playbackListeners = new Set<Listener>()

  getTarget = (): number => this.target
  getDisplay = (): number => this.display
  getPlayback = (): PlaybackState => this.playback
  isPlaying = (): boolean => this.playback.playing

  subscribeTarget = (listener: Listener) => this.subscribe(this.targetListeners, listener)
  subscribeDisplay = (listener: Listener) => this.subscribe(this.displayListeners, listener)
  subscribePlayback = (listener: Listener) => this.subscribe(this.playbackListeners, listener)

  setTarget(minutes: number) {
    const next = clampTime(minutes)
    if (next === this.target) return
    this.target = next
    this.emit(this.targetListeners)
    if (prefersReducedMotion()) {
      this.snapDisplay()
    } else {
      this.ensureLoop()
    }
  }

  play() {
    if (this.playback.playing) return
    // Restarting from the end: jump back to the start rather than sweeping
    // the whole day backwards through the smoothing.
    if (this.target >= TIME_MAX) {
      this.target = TIME_MIN
      this.emit(this.targetListeners)
      this.snapDisplay()
    }
    this.reducedMotionAccum = 0
    this.setPlayback({ ...this.playback, playing: true })
    this.ensureLoop()
  }

  pause() {
    if (!this.playback.playing) return
    // Playback advances in fractional minutes; land on a whole minute so the
    // readout, slider and the settled time sent to the backend stay clean.
    const rounded = Math.round(this.target)
    if (rounded !== this.target) {
      this.target = rounded
      this.emit(this.targetListeners)
      this.ensureLoop()
    }
    this.setPlayback({ ...this.playback, playing: false })
  }

  togglePlay() {
    if (this.playback.playing) this.pause()
    else this.play()
  }

  setSpeed(speed: PlaybackSpeed) {
    if (speed === this.playback.speed) return
    this.setPlayback({ ...this.playback, speed })
  }

  private subscribe(set: Set<Listener>, listener: Listener) {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  private emit(set: Set<Listener>) {
    for (const listener of set) listener()
  }

  private setPlayback(next: PlaybackState) {
    this.playback = next
    this.emit(this.playbackListeners)
  }

  private snapDisplay() {
    this.velocity = 0
    if (this.display === this.target) return
    this.display = this.target
    this.emit(this.displayListeners)
  }

  private ensureLoop() {
    if (this.raf) return
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    // Clamp dt so a backgrounded tab doesn't come back with one huge jump.
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const reducedMotion = prefersReducedMotion()

    if (this.playback.playing) this.advancePlayback(dt, reducedMotion)

    if (reducedMotion) {
      this.snapDisplay()
    } else if (this.display !== this.target || this.velocity !== 0) {
      let [next, velocity] = smoothDamp(this.display, this.target, this.velocity, SMOOTH_TIME_S, dt)
      if (Math.abs(next - this.target) < 0.01 && Math.abs(velocity) < 0.05) {
        next = this.target
        velocity = 0
      }
      this.velocity = velocity
      if (next !== this.display) {
        this.display = next
        this.emit(this.displayListeners)
      }
    }

    const settled = this.display === this.target && this.velocity === 0
    if (this.playback.playing || !settled) {
      this.raf = requestAnimationFrame(this.tick)
    } else {
      this.raf = 0
    }
  }

  private advancePlayback(dt: number, reducedMotion: boolean) {
    let next = this.target
    if (reducedMotion) {
      this.reducedMotionAccum += dt * this.playback.speed
      if (this.reducedMotionAccum < REDUCED_MOTION_STEP_S) return
      this.reducedMotionAccum = 0
      next += REDUCED_MOTION_STEP_MIN
    } else {
      next += dt * PLAY_RATE_MIN_PER_S * this.playback.speed
    }
    this.target = clampTime(next)
    this.emit(this.targetListeners)
    if (this.target >= TIME_MAX) this.pause()
  }
}

export const timeStore = new TimeStore()
