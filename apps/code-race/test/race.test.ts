import { describe, expect, it } from 'vitest'
import { clock, go, LAPS, newRace, pass } from '../src/lib/race.ts'
import { controlsFor, easeSteer, TOP_SPEED } from '../src/lib/vehicle.ts'

const road = { grass: false, oil: false, boosting: false }

describe('controls', () => {
  it('drives the rear wheels up to top speed, then lets off', () => {
    expect(
      controlsFor({ thrust: 1, turn: 0 }, 10, road).engine,
    ).toBeGreaterThan(0)
    expect(
      controlsFor({ thrust: 1, turn: 0 }, TOP_SPEED + 1, road).engine,
    ).toBe(0)
  })

  it('brakes when moving, and reverses once stopped', () => {
    const moving = controlsFor({ thrust: -1, turn: 0 }, 20, road)
    expect(moving.brake).toBeGreaterThan(0)
    expect(moving.engine).toBe(0)
    expect(controlsFor({ thrust: -1, turn: 0 }, 0, road).engine).toBeLessThan(0)
  })

  it("steers right with Rapier's negative angle, and less at speed", () => {
    const slow = controlsFor({ thrust: 0, turn: 1 }, 0, road).steer
    const fast = controlsFor({ thrust: 0, turn: 1 }, TOP_SPEED, road).steer
    expect(slow).toBeLessThan(0)
    expect(Math.abs(fast)).toBeLessThan(Math.abs(slow))
  })

  it('loses grip on oil and grass, and tops out lower on the grass', () => {
    const tarmac = controlsFor({ thrust: 1, turn: 0 }, 20, road).grip
    expect(
      controlsFor({ thrust: 1, turn: 0 }, 20, { ...road, oil: true }).grip,
    ).toBeLessThan(tarmac)
    expect(
      controlsFor({ thrust: 1, turn: 0 }, 20, { ...road, grass: true }).engine,
    ).toBe(0)
  })

  it('kicks the car on over a boost pad, throttle or not', () => {
    const boost = { ...road, boosting: true }
    expect(
      controlsFor({ thrust: 0, turn: 0 }, 50, boost).engine,
    ).toBeGreaterThan(0)
  })

  it('eases the wheels towards the stick', () => {
    const once = easeSteer(0, 1, 1 / 60)
    expect(once).toBeGreaterThan(0)
    expect(once).toBeLessThan(1)
  })
})

describe('race', () => {
  it('counts gates only in order and finishes after the last lap', () => {
    let race = go(newRace(3), 10)
    // Skipping to gate 2 counts for nothing.
    race = pass(race, 2, 11)
    expect(race.next).toBe(1)
    for (let lap = 0; lap < LAPS; lap++)
      for (const stop of [1, 2, 0])
        race = pass(race, stop, 20 + lap * 10 + stop)
    expect(race.lap).toBe(LAPS)
    expect(race.times).toHaveLength(LAPS)
    expect(race.finished).toBe(40 - 10)
  })

  it('ignores gates before the lights go green', () => {
    expect(pass(newRace(3), 1, 5).next).toBe(1)
  })

  it('reads like a race clock', () => {
    expect(clock(65.432)).toBe('1:05.43')
  })
})
