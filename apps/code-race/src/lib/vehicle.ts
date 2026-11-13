/**
 * The car's tuning, as plain numbers and one pure function, so the handling
 * can be tested and tweaked without a physics world. Rapier does the rest:
 * these numbers feed its raycast vehicle controller every step.
 *
 * Chassis axes: nose along +x, up along +y, right of travel along +z.
 */

/** What the driver is pressing. */
export interface Stick {
  /** `1` accelerate, `-1` brake then reverse, `0` coast. */
  readonly thrust: number
  /** `-1` left, `1` right. */
  readonly turn: number
}

/** What is under the wheels, and whether a boost is running. */
export interface Surface {
  readonly grass: boolean
  readonly oil: boolean
  readonly boosting: boolean
}

/** What the wheels are told this step. */
export interface Controls {
  /** Force on each driven (rear) wheel; negative reverses. */
  readonly engine: number
  /** Front-wheel angle in radians, Rapier's way: positive turns left. */
  readonly steer: number
  /** Brake on every wheel. */
  readonly brake: number
  /** Tyre grip: Rapier's friction slip. */
  readonly grip: number
}

/** Top speed on tarmac, in metres per second. */
export const TOP_SPEED = 42
const BOOST_SPEED = 64
const GRASS_SPEED = 16
const REVERSE_SPEED = 10
/** Engine force per rear wheel; the chassis has a mass of one. */
const ENGINE = 12
const BOOST_ENGINE = 30
const BRAKE = 0.3
/** A light drag on the wheels with nothing pressed, so the car rolls to a stop. */
const COAST_BRAKE = 0.02
/** Steering lock at a standstill, and how much of it is left flat out. */
const LOCK = 0.5
const LOCK_AT_SPEED = 0.35
const GRIP = 3.2
const GRASS_GRIP = 1.6
const OIL_GRIP = 0.35
/** How fast the wheels follow the stick, per second: a key press is all or nothing. */
const STEER_RATE = 6

/**
 * The wheel angle eased towards `target` over `dt` seconds, so a tap of an
 * arrow key turns in rather than snapping to full lock.
 */
export function easeSteer(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt * STEER_RATE)
}

/** How long one boost pad lasts, in seconds. */
export const BOOST_TIME = 1.6

/**
 * The controls for `stick` at `speed` (metres per second along the nose,
 * negative reversing) on `surface`.
 */
export function controlsFor(
  stick: Stick,
  speed: number,
  surface: Surface,
): Controls {
  const top = surface.grass
    ? GRASS_SPEED
    : surface.boosting
      ? BOOST_SPEED
      : TOP_SPEED
  // Less lock at speed, so the car is calm flat out and nimble in a hairpin.
  const calm =
    1 - (1 - LOCK_AT_SPEED) * Math.min(1, Math.abs(speed) / TOP_SPEED)
  const steer = -stick.turn * LOCK * calm
  const grip = surface.oil ? OIL_GRIP : surface.grass ? GRASS_GRIP : GRIP
  const force = surface.boosting ? BOOST_ENGINE : ENGINE
  // A boost pad kicks the car on even with the throttle up.
  if (surface.boosting && stick.thrust >= 0)
    return { engine: speed < top ? force : 0, steer, brake: 0, grip }
  if (stick.thrust > 0)
    return { engine: speed < top ? force : 0, steer, brake: 0, grip }
  if (stick.thrust < 0 && speed > 1)
    return { engine: 0, steer, brake: BRAKE, grip }
  if (stick.thrust < 0)
    return {
      engine: speed > -REVERSE_SPEED ? -force * 0.6 : 0,
      steer,
      brake: 0,
      grip,
    }
  return { engine: 0, steer, brake: COAST_BRAKE, grip }
}
