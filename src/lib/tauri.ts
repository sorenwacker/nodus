// Tauri API wrapper that gracefully handles browser context

let invokeFunc: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
let listenFunc: (<T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>) | null = null

async function getInvoke() {
  if (invokeFunc) return invokeFunc

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    invokeFunc = invoke
    return invoke
  } catch {
    // Return a mock that throws descriptive errors
    return async (cmd: string) => {
      throw new Error(`Tauri not available: ${cmd}`)
    }
  }
}

async function getListen() {
  if (listenFunc) return listenFunc

  try {
    const { listen } = await import('@tauri-apps/api/event')
    listenFunc = listen
    return listen
  } catch {
    // Return a mock that does nothing
    return async () => () => {}
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = await getInvoke()
  return fn(cmd, args) as Promise<T>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      return
    } catch {
      // Fallback if plugin fails
    }
  }
  // Fallback for browser or if plugin unavailable
  window.open(url, '_blank')
}

export async function listen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  const fn = await getListen()
  return fn<T>(event, (e) => handler(e.payload))
}

export async function readTextFile(path: string): Promise<string> {
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path)
  } catch {
    throw new Error(`Cannot read file: ${path}`)
  }
}

export async function extractPdfText(path: string): Promise<string> {
  return invoke<string>('extract_pdf_text', { path })
}

export async function refreshWorkspace(workspaceId: string | null): Promise<number> {
  return invoke<number>('refresh_workspace', { workspaceId })
}

// File locking for safe concurrent editing
export async function checkFileAvailable(path: string): Promise<boolean> {
  return invoke<boolean>('check_file_available', { path })
}

export async function acquireEditLock(nodeId: string): Promise<void> {
  return invoke<void>('acquire_edit_lock', { nodeId })
}

export async function releaseEditLock(nodeId: string): Promise<void> {
  return invoke<void>('release_edit_lock', { nodeId })
}

export async function getLockedNodes(): Promise<string[]> {
  return invoke<string[]>('get_locked_nodes')
}
