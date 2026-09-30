/**
 * Frames are removed (docs/design/remove-frames.md).
 *
 * A frame recorded membership by a stored frame_id, so resizing or moving it
 * let the box on the canvas and the membership drift apart. Only the
 * migration that converts existing frames to tags may still name them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SCANNED = ['src', 'src-tauri/src', 'packages/nodus-mcp-server/src']
const EXTENSIONS = /\.(ts|vue|rs)$/
/** The migration converts frames to tags; it has to name what it removes */
const ALLOWED = new Set(['src-tauri/src/database/remove_frames.rs', 'src/__tests__/no-frames.test.ts'])
/** Identifiers of the frames feature; "frame" alone also means an animation frame */
const FRAME_CODE =
  /\b(frame_id|frameId|parent_frame_id|createFrame|createFrameAsync|assignNodes?ToFrame|useFramesStore|framesStore|CanvasFrames|useFrames|resolveFrameOverlaps|fitFrameToContents|McpFrame|FrameTools|frameTools)\b|\bFrame(\[\]|>|,|\s*\||\s*\}|\s*=)|: Frame\b|type Frame\b|struct Frame\b|Vec<Frame>/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '__tests__' ? [] : files(path)
    return EXTENSIONS.test(name) ? [path] : []
  })
}

describe('frames', () => {
  it('are referenced nowhere but in their removal migration', () => {
    const offenders = SCANNED.flatMap(dir => files(join(ROOT, dir)))
      .map(path => relative(ROOT, path))
      .filter(path => !ALLOWED.has(path))
      .flatMap(path =>
        readFileSync(join(ROOT, path), 'utf-8')
          .split('\n')
          .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
          .filter(({ line }) => FRAME_CODE.test(line))
          .map(({ at, line }) => `${at}: ${line.trim()}`)
      )

    expect(offenders).toEqual([])
  })
})
