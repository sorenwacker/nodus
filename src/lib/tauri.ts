// Tauri API wrapper that gracefully handles browser context

let invokeFunc: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

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

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = await getInvoke()
  return fn(cmd, args) as Promise<T>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}
