/**
 * The workspace an id names.
 *
 * The unnamed workspace is stored as null and named "default" by the workspace
 * store, so null, undefined, the empty string and "default" are all the same
 * workspace. Compare workspace ids through this, never directly.
 */
export function unnamedAsNull(id: string | null | undefined): string | null {
  return !id || id === 'default' ? null : id
}
