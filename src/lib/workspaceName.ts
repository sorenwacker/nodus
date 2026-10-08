/**
 * Workspace name cleaning, shared by the workspace store and the MCP handler
 */
import { stripHtmlTags } from './sanitize'

const MAX_WORKSPACE_NAME_LENGTH = 100

/**
 * Trim a workspace name, strip HTML tags and control characters, and truncate
 * it. Returns an empty string when nothing is left; the caller decides whether
 * that is an error or gets a fallback name.
 */
export function cleanWorkspaceName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = stripHtmlTags(name.trim()).replace(/[\x00-\x1f\x7f]/g, '').trim()
  return cleaned.slice(0, MAX_WORKSPACE_NAME_LENGTH)
}
