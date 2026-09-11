/**
 * The local check scripts run what CI runs.
 *
 * `scripts/ci-check.sh` says it runs the same checks as GitHub Actions, and
 * `scripts/setup-hooks.sh` installs `scripts/pre-commit` as the commit gate.
 * Both had drifted from CI: the tracked hook only linted staged files, so
 * installing it replaced a hook that ran the test suites with one that ran
 * none, and `ci-check.sh` linted Rust without `--all-targets` and never
 * type-checked (development.md > Commands).
 *
 * Every command in a CI check job is either setup, recorded below with the
 * reason, or a check both scripts must run.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

const ROOT = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/** The CI jobs whose commands decide whether a change may merge */
const CHECK_JOBS = ['test-rust', 'test-frontend', 'mcp-server']

/** Commands that prepare a CI runner rather than check the code */
const SETUP: Array<{ matches: (job: string, command: string) => boolean; reason: string }> = [
  { matches: (_, c) => c === 'npm ci', reason: 'installs dependencies' },
  { matches: (_, c) => c.startsWith('sudo '), reason: 'installs system packages on the Linux runner' },
  {
    matches: (job, c) => job === 'test-rust' && c === 'npm run build',
    reason: "the Tauri build script needs dist/ before cargo can compile the backend",
  },
]

/** Flags that change how much a command prints, not what it checks */
function normalise(text: string): string {
  return text.replace(/ --(verbose|quiet|silent)\b/g, '')
}

interface CiStep {
  run?: string
  'working-directory'?: string
}
interface CiJob {
  defaults?: { run?: { 'working-directory'?: string } }
  steps: CiStep[]
}

interface Check {
  job: string
  command: string
  /** The directory the command runs in, relative to the repository root */
  directory: string
}

function ciChecks(): Check[] {
  const workflow = parse(read('.github/workflows/ci.yml')) as { jobs: Record<string, CiJob> }
  const checks: Check[] = []
  for (const job of CHECK_JOBS) {
    const spec = workflow.jobs[job]
    if (!spec) continue
    for (const step of spec.steps) {
      if (!step.run) continue
      const directory = step['working-directory'] ?? spec.defaults?.run?.['working-directory'] ?? '.'
      for (const line of step.run.split('\n')) {
        const command = normalise(line.trim())
        if (!command || command.startsWith('#')) continue
        if (SETUP.some(s => s.matches(job, command))) continue
        checks.push({ job, command, directory })
      }
    }
  }
  return checks
}

describe('CI checks', () => {
  it('has every check job', () => {
    const workflow = parse(read('.github/workflows/ci.yml')) as { jobs: Record<string, CiJob> }
    const missing = CHECK_JOBS.filter(job => !(job in workflow.jobs))
    expect(missing, `ci.yml has no job named ${missing.join(', ')}`).toEqual([])
  })

  it('builds the MCP server package, which type-checks the files the root suite never imports', () => {
    const build = ciChecks().find(
      c => c.directory === 'packages/nodus-mcp-server' && c.command === 'npm run build'
    )
    expect(build, 'no CI step runs npm run build in packages/nodus-mcp-server').toBeDefined()
  })
})

for (const script of ['scripts/ci-check.sh', 'scripts/pre-commit']) {
  describe(`${script} runs what CI runs`, () => {
    const text = normalise(read(script))

    for (const check of ciChecks()) {
      it(`runs "${check.command}" from ${check.directory}`, () => {
        expect(text.includes(check.command), `${script} never runs "${check.command}"`).toBe(true)
        if (check.directory !== '.') {
          expect(
            text.includes(check.directory),
            `${script} never enters ${check.directory}, where CI runs "${check.command}"`
          ).toBe(true)
        }
      })
    }
  })
}
