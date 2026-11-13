import { useEffect, useRef, type RefObject } from 'react'
import type { Stick } from './lib/vehicle.ts'

const UP = new Set(['ArrowUp', 'KeyW'])
const DOWN = new Set(['ArrowDown', 'KeyS'])
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const DRIVING = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT])

/** Whether any of `codes` is held. */
function any(held: ReadonlySet<string>, codes: ReadonlySet<string>): boolean {
  for (const c of codes) if (held.has(c)) return true
  return false
}

/**
 * The stick, read from arrows or WASD. A ref, not state: the car reads it
 * every frame, and re-rendering on every key would only cost.
 */
export function useStick(): RefObject<Stick> {
  const stick = useRef<Stick>({ thrust: 0, turn: 0 })
  useEffect(() => {
    const held = new Set<string>()
    const read = (): void => {
      stick.current = {
        thrust: Number(any(held, UP)) - Number(any(held, DOWN)),
        turn: Number(any(held, RIGHT)) - Number(any(held, LEFT)),
      }
    }
    const down = (e: KeyboardEvent): void => {
      if (!DRIVING.has(e.code)) return
      // Arrows would otherwise scroll the page or move a focused select.
      e.preventDefault()
      held.add(e.code)
      read()
    }
    const up = (e: KeyboardEvent): void => {
      held.delete(e.code)
      read()
    }
    // A key let go while the window is unfocused never sends its keyup.
    const blur = (): void => {
      held.clear()
      read()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return stick
}
