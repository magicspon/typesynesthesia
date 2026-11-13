import type { JSX } from 'react'
import { LAPS } from './lib/race.ts'
import type { Entrant } from './lib/standings.ts'

/**
 * The running order: each car's place, livery and lap. Rivals are named
 * after the packages they stand for, so the leaderboard reads like a league
 * table of the repository's own code.
 */
export function Standings({
  order,
}: {
  order: readonly Entrant[]
}): JSX.Element {
  return (
    <section className="panel standings" aria-label="Race standings">
      <ol>
        {order.map((e) => (
          <li key={e.name} className={e.player ? 'you' : undefined}>
            <span className="swatch" style={{ background: e.colour }} />
            <span className="who">{e.name}</span>
            <span className="dim">
              {e.race.finished !== null
                ? 'done'
                : `L${Math.min(e.race.lap + 1, LAPS)}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
