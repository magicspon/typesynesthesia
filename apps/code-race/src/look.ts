import { hash } from '@tsyn/code-art/rng'
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * The palette: a dusk sky with every repository's sunset a little different,
 * shifted round the colour wheel by its name, so two circuits never look
 * like the same place.
 */
export interface Look {
  readonly zenith: Color
  readonly horizon: Color
  readonly sun: Color
  readonly fog: Color
  readonly grassLow: Color
  readonly grassHigh: Color
}

/** The look for the repository `name`. */
export function lookOf(name: string): Look {
  // Up to about 30° either way: enough to tell apart, never a green sky.
  const shift = ((hash(name) % 1000) / 1000 - 0.5) * 0.16
  const tint = (hex: string): Color => new Color(hex).offsetHSL(shift, 0, 0)
  return {
    zenith: tint('#141a4a'),
    horizon: tint('#ff9466'),
    sun: tint('#ffc58a'),
    fog: tint('#8a5a7a'),
    grassLow: tint('#2f5a3c').offsetHSL(-shift * 0.7, 0, 0),
    grassHigh: tint('#7a9a52').offsetHSL(-shift * 0.7, 0, 0),
  }
}

/** A canvas of `w` × `h` and its 2D context; textures are drawn, not loaded. */
function canvas(
  w: number,
  h: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

/** Wraps a drawn canvas as a repeating colour texture. */
function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Tarmac: speckled asphalt, white edge lines and a dashed centre line. `u`
 * runs across the road, `v` along it, one repeat per `ROAD_REPEAT` units.
 */
export function roadTexture(): CanvasTexture {
  const [c, g] = canvas(256, 512)
  g.fillStyle = '#34343c'
  g.fillRect(0, 0, 256, 512)
  // Seeded speckle, so the grain is the same on every load.
  let seed = 7
  const next = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let k = 0; k < 6000; k++) {
    const v = 40 + Math.floor(next() * 40)
    g.fillStyle = `rgb(${v},${v},${v + 6})`
    g.fillRect(next() * 256, next() * 512, 2, 2)
  }
  g.fillStyle = '#e8e8e8'
  g.fillRect(10, 0, 6, 512)
  g.fillRect(240, 0, 6, 512)
  // Three short dashes per repeat.
  g.fillStyle = '#f2c94c'
  for (const y of [0, 171, 342]) g.fillRect(125, y, 6, 70)
  return texture(c)
}

/** World units per repeat of the road texture. */
export const ROAD_REPEAT = 18

/** Red and white blocks along `v`, for the kerbs: two blocks per repeat. */
export function kerbTexture(): CanvasTexture {
  const [c, g] = canvas(8, 64)
  g.fillStyle = '#f1f1f1'
  g.fillRect(0, 0, 8, 64)
  g.fillStyle = '#d62839'
  g.fillRect(0, 0, 8, 32)
  const t = texture(c)
  t.magFilter = 1003 // NearestFilter: hard edges between the blocks.
  t.repeat.set(1, 4)
  return t
}

/** Black and white squares, for the start line. */
export function checkerTexture(): CanvasTexture {
  const [c, g] = canvas(64, 64)
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'
      g.fillRect(i * 8, j * 8, 8, 8)
    }
  const t = texture(c)
  t.magFilter = 1003 // NearestFilter: crisp squares.
  return t
}

/** Arrows pointing along +u, for boost pads. */
export function chevronTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128)
  g.fillStyle = '#003c38'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = '#7dfff0'
  g.lineWidth = 12
  for (const x of [20, 60]) {
    g.beginPath()
    g.moveTo(x, 20)
    g.lineTo(x + 36, 64)
    g.lineTo(x, 108)
    g.stroke()
  }
  return texture(c)
}
