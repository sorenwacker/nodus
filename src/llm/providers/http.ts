/**
 * HTTP client wrapper
 * Uses Tauri Rust backend for HTTP requests (bypasses CORS completely)
 */

import { invoke } from '@tauri-apps/api/core'

// Check if we're running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

interface HttpRequestInput {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeout_ms?: number
}

interface HttpResponse {
  status: number
  body: string
}

interface FetchOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal
  connectTimeout?: number
}

/**
 * Make an HTTP request
 * Uses Tauri's Rust backend to bypass CORS when running in Tauri
 */
export async function httpFetch(
  url: string,
  options?: FetchOptions
): Promise<Response> {
  if (isTauri) {
    const headers: Record<string, string> = {}
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value
        })
      } else {
        Object.assign(headers, options.headers)
      }
    }

    const input: HttpRequestInput = {
      url,
      method: options?.method || 'GET',
      headers,
      body: options?.body as string | undefined,
      timeout_ms: options?.connectTimeout || 60000,
    }

    try {
      const result = await invoke<HttpResponse>('http_request', { input })

      // Create a Response-like object
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        statusText: '',
        headers: new Headers(),
        json: async () => {
          try {
            return JSON.parse(result.body)
          } catch (e) {
            console.error('Failed to parse API response as JSON:', result.body.slice(0, 200))
            throw new Error(`Invalid JSON response: ${e instanceof Error ? e.message : e}`)
          }
        },
        text: async () => result.body,
      } as Response
    } catch (e) {
      console.error('Tauri HTTP error:', e)
      throw e
    }
  }

  // Fallback to browser fetch (for dev without Tauri)
  return fetch(url, options)
}
