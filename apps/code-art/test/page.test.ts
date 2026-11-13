import { describe, expect, it } from 'vitest'
import { artPage } from '../scripts/page.ts'
import { atlas } from './fixture.ts'

const VIEWER = '<body><div id="root"></div>\n<!-- tsyn-art:data -->\n</body>'

/** The JSON inside the block named `name`, read back as the viewer reads it. */
function readBack(page: string, name: string): unknown {
  const match = new RegExp(
    `<script type="application/json" data-dataset="${name}">(.*?)</script>`,
  ).exec(page)
  return match ? JSON.parse(match[1]!) : undefined
}

describe('artPage', () => {
  it('writes each dataset as its own block, in place of the marker', () => {
    const page = artPage(VIEWER, { one: atlas(), two: atlas() })
    expect(page).not.toContain('tsyn-art:data')
    expect(readBack(page, 'one')).toEqual(atlas())
    expect(readBack(page, 'two')).toEqual(atlas())
  })

  it('keeps a path holding `</script>` from closing the block', () => {
    const data = atlas()
    const hostile = {
      ...data,
      files: [{ ...data.files[0]!, path: 'a/</script><b>$&.ts' }],
    }
    const page = artPage(VIEWER, { x: hostile })
    expect(page.match(/<\/script>/g)).toHaveLength(1)
    expect(readBack(page, 'x')).toEqual(hostile)
  })

  it('escapes a name that would break out of its attribute', () => {
    const page = artPage(VIEWER, { 'a"b&c': atlas() })
    expect(page).toContain('data-dataset="a&quot;b&amp;c"')
  })

  it('writes symbol names in blocks of their own', () => {
    const names = { 'src/a.ts': [['</script>'], [], [], [], [], [], [], []] }
    const page = artPage(VIEWER, { one: atlas() }, { one: names })
    const match =
      /<script type="application\/json" data-symbols="one">(.*?)<\/script>/.exec(
        page,
      )
    expect(JSON.parse(match![1]!)).toEqual(names)
    expect(page.match(/<\/script>/g)).toHaveLength(2)
  })

  it('opens on a scene when given one, without overriding a typed route', () => {
    const page = artPage(
      VIEWER,
      { 'my repo': atlas() },
      {},
      {
        dataset: 'my repo',
        scene: 'metro',
      },
    )
    expect(page).toContain(
      '<script>if(!location.hash)location.hash="#/my%20repo?scene=metro"</script>',
    )
  })

  it('opens the galaxy, the default scene, with no search', () => {
    const page = artPage(
      VIEWER,
      { one: atlas() },
      {},
      {
        dataset: 'one',
        scene: 'galaxy',
      },
    )
    expect(page).toContain('location.hash="#/one"')
  })

  it('opens on the dataset list when given no scene', () => {
    expect(artPage(VIEWER, { one: atlas() })).not.toContain('location.hash')
  })

  it('refuses a page that is not the embed build', () => {
    expect(() => artPage('<body></body>', {})).toThrow(/embed build/)
  })
})
