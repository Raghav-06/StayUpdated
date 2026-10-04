const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`
const TOKEN_KEY = 'su_token'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export async function api(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? tokenStore.get() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Is the backend running?', 0)
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized()
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data
}

export const googleSignInUrl = `${BASE}/auth/google`
