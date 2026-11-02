/**
 * A relative import in the MCP server names the file Node will load.
 *
 * The server is compiled by tsc and run by Node as an ES module. Node resolves
 * a relative specifier literally, so './readTools' is not found where
 * './readTools.js' is, and tsc copies the specifier as written without
 * complaint. The tool index imported its six groups without the extension, so
 * the built server stopped at startup and no client could connect
 * (PRODUCT_DESIGN.md > An import the built MCP server can resolve).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SERVER_SRC = resolve(__dirname, '../../packages/nodus-mcp-server/src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/** Relative imports and re-exports that survive compilation, as 'file: specifier'. */
function runtimeRelativeImports(): string[] {
  return sourceFiles(SERVER_SRC).flatMap(file => {
    const source = readFileSync(file, 'utf-8')
    // Type-only statements are erased by tsc, so Node never resolves them
    const statements = source.matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)
    return [...statements].map(m => `${relative(SERVER_SRC, file)}: ${m[1]}`)
  })
}

describe('the MCP server source', () => {
  it('finds the relative imports', () => {
    expect(runtimeRelativeImports().length).toBeGreaterThan(5)
  })

  it('ends every relative import that reaches Node in .js', () => {
    const unresolvable = runtimeRelativeImports().filter(entry => !entry.endsWith('.js'))

    expect(unresolvable, 'Node cannot resolve these in the built server').toEqual([])
  })
})
