/**
 * Locating a file inside a vault.
 *
 * One definition, because two copies of a path rule drift: the import path and
 * the file-sync path each had their own, differing only in a null guard, and
 * either could have gained a fix the other did not
 * (PRODUCT_DESIGN.md > One rule, one place).
 */

/**
 * The folder a file sits in, relative to the vault root.
 *
 * Returns an empty string for a file at the vault root, for a file outside the
 * vault, and when there is no vault. Paths are compared with `/` separators on
 * every platform, so a Windows path is normalised first.
 */
export function relativeFolder(filePath: string, vaultPath: string | null): string {
  if (!vaultPath) return ''

  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (!normalizedFile.startsWith(normalizedVault)) return ''

  const relativePath = normalizedFile.slice(normalizedVault.length + 1)
  const lastSlash = relativePath.lastIndexOf('/')
  return lastSlash > 0 ? relativePath.slice(0, lastSlash) : ''
}
