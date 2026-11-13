import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Physics } from '@react-three/rapier'
import type { Atlas } from '@tsyn/code-art/atlas'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react'
import { Circuit } from './Circuit.tsx'
import { Course } from './Course.tsx'
import { DATASETS, loadAtlas } from './data.ts'
import { Driver } from './Driver.tsx'
import { Rivals } from './Rivals.tsx'
import { Hud } from './Hud.tsx'
import { Land } from './Land.tsx'
import { lookOf } from './look.ts'
import { Sky } from './Sky.tsx'
import { useStick } from './keys.ts'
import { fastest, go, newRace, pass, type Race } from './lib/race.ts'
import { rivalsOf } from './lib/rivals.ts'
import type { Entrant } from './lib/standings.ts'
import { trackOf } from './lib/track.ts'

/**
 * Physics steps a fixed 1/120 s: a variable step lets one slow frame (the
 * first, while shaders compile) throw the car off its springs, and 120 Hz
 * keeps the car smooth on fast screens without interpolation.
 */
const PHYSICS_STEP = 1 / 120

/** The race clock, in seconds. */
const seconds = (): number => performance.now() / 1000

/** The best lap kept for `name`, or `null`. Storage may be blocked. */
function readBest(name: string): number | null {
  try {
    const v = Number(localStorage.getItem(`tsyn-race:${name}`))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

/** Keeps `lap` as the best for `name` if it beats what is kept. */
function keepBest(name: string, lap: number): void {
  try {
    const best = readBest(name)
    if (best === null || lap < best)
      localStorage.setItem(`tsyn-race:${name}`, String(lap))
  } catch {
    // A best lap is a nicety; losing it is fine.
  }
}

/** The repository named in `?repo=`, or tsyn's own. */
function firstDataset(): string {
  const asked = new URLSearchParams(location.search).get('repo')
  if (asked && DATASETS.includes(asked)) return asked
  return DATASETS.includes('tsyn') ? 'tsyn' : (DATASETS[0] ?? '')
}

/** One race at a time through one repository's circuit. */
function Session({
  atlas,
  dataset,
  onDataset,
}: {
  atlas: Atlas
  dataset: string
  onDataset: (name: string) => void
}): JSX.Element {
  const track = useMemo(() => trackOf(atlas), [atlas])
  const look = useMemo(() => lookOf(atlas.name), [atlas])
  const stops = track?.files.length ?? 1
  const [run, setRun] = useState(0)
  const [race, setRace] = useState<Race>(() => newRace(stops))
  const [stop, setStop] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [best, setBest] = useState(() => readBest(dataset))
  const stick = useStick()
  const speedo = useRef<HTMLSpanElement>(null)
  const rivals = useMemo(() => rivalsOf(atlas), [atlas])
  // Everyone's line in the standings, fresh each run: rivals in grid order,
  // then the player at the back. Mutated as cars move; the HUD polls it.
  const field = useMemo<Entrant[]>(
    () => [
      ...rivals.map((r) => ({
        name: r.name,
        colour: r.colour,
        player: false,
        race: newRace(stops),
        index: 0,
      })),
      {
        name: 'you',
        colour: '#e63946',
        player: true,
        race: newRace(stops),
        index: 0,
      },
    ],
    // `run` is a dependency on purpose: a restart starts a fresh field.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [rivals, stops, run],
  )
  const me = field.at(-1)!
  // Memoised: a new array each render would rebuild every rival car.
  const others = useMemo(() => field.slice(0, -1), [field])
  // The player's race lives in React state; the standings read this copy.
  me.race = race

  // A new run: back to the grid, and three seconds of lights.
  useEffect(() => {
    setRace(newRace(stops))
    setStop(0)
    setCountdown(3)
    let left = 3
    const id = setInterval(() => {
      left -= 1
      setCountdown(left)
      if (left > 0) return
      clearInterval(id)
      const now = seconds()
      // Every car gets the same green light.
      for (const e of field) if (!e.player) e.race = go(e.race, now)
      setRace((r) => go(r, now))
    }, 1000)
    return () => clearInterval(id)
  }, [run, stops, field])

  useEffect(() => {
    const restart = (e: KeyboardEvent): void => {
      if (e.code === 'KeyR') setRun((n) => n + 1)
    }
    window.addEventListener('keydown', restart)
    return () => window.removeEventListener('keydown', restart)
  }, [])

  // Each finished lap is a chance at the record.
  const lapTime = fastest(race.times)
  useEffect(() => {
    if (lapTime === null) return
    keepBest(dataset, lapTime)
    setBest(readBest(dataset))
  }, [dataset, lapTime])

  const onStop = useCallback((s: number) => {
    setStop(s)
    setRace((r) => pass(r, s, seconds()))
  }, [])

  if (!track)
    return (
      <p className="centre">{dataset} has no source files to race through.</p>
    )
  return (
    <>
      <Canvas
        shadows
        camera={{ fov: 66, near: 0.5, far: 2000, position: [0, 30, 40] }}
      >
        <color attach="background" args={[look.fog]} />
        <fog attach="fog" args={[look.fog, 140, 760]} />
        <Sky look={look} />
        <hemisphereLight
          args={[
            look.zenith.clone().lerp(look.horizon, 0.5),
            look.grassLow,
            1.1,
          ]}
        />
        <Land track={track} look={look} />
        <Circuit track={track} next={race.next} />
        {/* Rapier loads its engine first; the scenery shows meanwhile. */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep={PHYSICS_STEP}>
            {/* Keyed by run, so a restart stands the cones back up and puts
                a fresh car on the grid. */}
            <Course key={`course-${run}`} track={track} />
            <Rivals
              key={`rivals-${run}`}
              track={track}
              rivals={rivals}
              entrants={others}
              racing={race.start !== null}
            />
            <Driver
              key={run}
              track={track}
              stick={stick}
              racing={race.start !== null && race.finished === null}
              slot={rivals.length}
              entrant={me}
              onStop={onStop}
              speedo={speedo}
            />
          </Physics>
        </Suspense>
        {/* Only what glows blooms: lights, gates, pads and windows. */}
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.9} luminanceThreshold={0.85} mipmapBlur />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      </Canvas>
      <Hud
        datasets={DATASETS}
        dataset={dataset}
        onDataset={onDataset}
        atlas={atlas}
        track={track}
        race={race}
        field={field}
        stop={stop}
        countdown={countdown}
        best={best}
        speedo={speedo}
      />
    </>
  )
}

/** Loads the chosen repository and races through it. */
export function Game(): JSX.Element {
  const [dataset, setDataset] = useState(firstDataset)
  const [atlas, setAtlas] = useState<{ name: string; atlas: Atlas } | null>(
    null,
  )
  useEffect(() => {
    let live = true
    void loadAtlas(dataset).then(
      (a) => live && setAtlas({ name: dataset, atlas: a }),
    )
    return () => void (live = false)
  }, [dataset])
  if (!dataset) return <p className="centre">No datasets to race through.</p>
  if (atlas?.name !== dataset)
    return <p className="centre">Building the circuit…</p>
  // Keyed by dataset, so a new repository starts a new session.
  return (
    <Session
      key={dataset}
      atlas={atlas.atlas}
      dataset={dataset}
      onDataset={setDataset}
    />
  )
}
