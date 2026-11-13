/**
 * What a captured stack is allowed to contain.
 *
 * ADR 0011 keeps the stack because it diagnoses bugs the message cannot, and
 * keeps only tsyn's own frames because everything else in it is the user's:
 * the frames below ours are their code, and the absolute prefix above ours is
 * their machine. Both halves are asserted here, because a report built on this
 * is pasted into a public issue unread.
 */

import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { tsynFrames } from '../src/stack.ts'

/** A real path inside `@tsyn/core`, wherever this installation puts it. */
const coreEntry = fileURLToPath(import.meta.resolve('@tsyn/core'))

/** An error carrying a stack we wrote, so the frames are known exactly. */
const withStack = (...frames: string[]): Error => {
  const error = new Error('boom')
  error.stack = ['Error: boom', ...frames.map((frame) => `    ${frame}`)].join(
    '\n',
  )
  return error
}

describe('tsynFrames', () => {
  it('keeps a frame inside tsyn, rewritten to its package', () => {
    const frames = tsynFrames(withStack(`at open (${coreEntry}:12:3)`))

    expect(frames).toHaveLength(1)
    expect(frames?.[0]).toContain('@tsyn/core/')
    expect(frames?.[0]).toContain(':12:3')
  })

  it('rewrites a frame Node spelled as a `file://` URL', () => {
    // ESM frames are URLs, and a rule that only knew paths would leave
    // `file://` stranded in front of the package name.
    const frames = tsynFrames(
      withStack(`at open (${pathToFileURL(coreEntry).href}:12:3)`),
    )

    expect(frames?.[0]).toBe('at open (@tsyn/core/src/index.ts:12:3)')
  })

  it('never carries the absolute prefix above tsyn', () => {
    // That prefix is the user's home directory and their repository's name, so
    // it is a repository fact hiding inside a frame that is otherwise ours.
    const frames = tsynFrames(withStack(`at open (${coreEntry}:12:3)`))

    expect(frames?.[0]).not.toContain(dirname(coreEntry))
  })

  it('drops a frame below tsyn, which is code that is not ours', () => {
    const frames = tsynFrames(
      withStack(
        'at handler (/home/alice/work/their-app/src/index.ts:4:1)',
        `at open (${coreEntry}:12:3)`,
      ),
    )

    expect(frames).toEqual([expect.stringContaining('@tsyn/core/')])
  })

  it('has nothing to say about a stack with no tsyn frame in it', () => {
    expect(
      tsynFrames(withStack('at handler (/home/alice/app/src/index.ts:4:1)')),
    ).toBeUndefined()
  })

  it('has nothing to say about a value that is not an error', () => {
    expect(tsynFrames('ENOENT')).toBeUndefined()
  })
})
