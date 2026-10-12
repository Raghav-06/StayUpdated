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

// Splits a text/event-stream body into { type, data } events.
async function* readEvents(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value.replace(/\r\n/g, '\n')
    let end
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let type = 'message'
      const data = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) yield { type, data: JSON.parse(data.join('\n')) }
    }
  }
}

/**
 * POSTs to a streaming endpoint and calls onEvent(type, data) for each server-sent event.
 * Resolves with the `done` event's data; rejects with an ApiError on an `error` event.
 * (EventSource can't send a POST body or headers, hence fetch.)
 */
export async function streamApi(path, { body, signal, onEvent = () => {} } = {}) {
  const token = tokenStore.get()
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Is the backend running?', 0)
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 401 && token) onUnauthorized()
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }

  try {
    for await (const { type, data } of readEvents(res.body)) {
      if (type === 'error') throw new ApiError(data.message, data.status ?? 500)
      onEvent(type, data)
      if (type === 'done') return data
    }
  } catch (err) {
    if (err instanceof ApiError || err.name === 'AbortError') throw err
  }
  throw new ApiError('The connection was interrupted. Please try again.', 0)
}
