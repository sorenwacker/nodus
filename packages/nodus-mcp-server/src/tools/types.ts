/**
 * The shape the MCP protocol expects of a tool declaration.
 *
 * Declared here rather than imported from the SDK: the root typecheck follows
 * these files (the tool surface gates import NODUS_TOOLS to compare the two
 * surfaces), and CI installs only the root's dependencies, so an SDK import
 * here fails the typecheck on a machine that has never built this package. The
 * server itself still uses the SDK types where it talks to the SDK.
 */
export interface McpToolDeclaration {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}
