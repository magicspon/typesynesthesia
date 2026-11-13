import { useEffect, useState, type JSX, type RefObject } from 'react'
import type { Atlas } from '@tsyn/code-art/atlas'
import { clock, fastest, LAPS, type Race } from './lib/race.ts'
import { ordinal, standingsOf, type Entrant } from './lib/standings.ts'
import type { Track } from './lib/track.ts'
import { Standings } from './Standings.tsx'

/** What the HUD shows. */
export interface HudProps {
  readonly datasets: readonly string[]
  readonly dataset: string
  readonly onDataset: (name: string) => void
  readonly atlas: Atlas
  readonly track: Track
  readonly race: Race
  /** Every car's line in the standings, player last; mutated as they move. */
  readonly field: readonly Entrant[]
  /** The stretch the car is on. */
  readonly stop: number
  /** `3`, `2`, `1` before the lights; `0` once green. */
  readonly countdown: number
  /** The best lap ever driven on this circuit, from this browser. */
  readonly best: number | null
  readonly speedo: RefObject<HTMLSpanElement | null>
}

/** The clock's reading, re-rendered a few times a second while racing. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now() / 1000)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(performance.now() / 1000), 50)
    return () => clearInterval(id)
  }, [running])
  return now
}

/** Laps, clock, the file being driven through, and the start and finish. */
export function Hud(props: HudProps): JSX.Element {
  const { race, track, atlas, stop, countdown, best } = props
  const racing = race.start !== null && race.finished === null
  // `now` ticks while racing, which also refreshes the standings.
  const now = useNow(racing)
  const file = atlas.files[track.files[stop]!]!
  const stretch = track.stretches[stop]!
  const last = race.times.at(-1)
  // Read from the moving field on every tick of `now`.
  const order = standingsOf(props.field, track.samples.length)
  const place = order.findIndex((e) => e.player) + 1
  const of = order.length
  return (
    <div className="hud">
      <section className="panel top-left">
        <select
          value={props.dataset}
          onChange={(e) => {
            props.onDataset(e.target.value)
            // Hand the arrows back to the car.
            e.target.blur()
          }}
          aria-label="Repository to race through"
        >
          {props.datasets.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {of > 1 && (
          <p className="big">
            P{place}/{of}
          </p>
        )}
        <p className="big">
          Lap {Math.min(race.lap + 1, LAPS)}/{LAPS}
        </p>
        <p className="big">{racing ? clock(now - race.lapStart) : clock(0)}</p>
        <p>Last {last === undefined ? '–' : clock(last)}</p>
        <p>Best {best === null ? '–' : clock(best)}</p>
      </section>

      <section className="panel top-right">
        <p className="dim">
          Checkpoint {stop + 1}/{track.files.length}
        </p>
        <p className="path">{file.path}</p>
        <ul>
          {stretch.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      {of > 1 && <Standings order={order} />}

      <section className="panel bottom-right">
        <span ref={props.speedo} className="big">
          0
        </span>{' '}
        km/h
      </section>

      <section className="panel bottom-left dim">
        Arrows or WASD to drive · Enter to get back on the road · R to restart
      </section>

      {countdown > 0 && <div className="centre">{countdown}</div>}
      {race.finished !== null && (
        <div className="centre result">
          <p>
            {of > 1 ? `${ordinal(place)} of ${of}` : 'Finished'} in{' '}
            {clock(race.finished)}
          </p>
          <p className="dim">Fastest lap {clock(fastest(race.times)!)}</p>
          <p className="dim">Press R to race again</p>
        </div>
      )}
    </div>
  )
}
