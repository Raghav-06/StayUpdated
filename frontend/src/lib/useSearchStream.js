import { useCallback, useEffect, useRef, useState } from 'react'
import { streamApi } from './api.js'

const IDLE = null

function reduce(state, type, data) {
  switch (type) {
    case 'stage':
      return { ...state, stage: data.stage, sourceCount: data.sourceCount ?? state.sourceCount }
    case 'provider':
      return { ...state, providers: [...state.providers.filter((p) => p.name !== data.name), data] }
    case 'progress':
      return { ...state, progress: data }
    case 'summary':
      return { ...state, summary: state.summary + data.delta }
    default:
      return state
  }
}

/**
 * Runs a streamed news search. `progress` is null when idle, else what the server has
 * reported so far. `start(body)` resolves with the finished result; `cancel()` aborts it
 * (start then rejects with an AbortError). Leaving the page also aborts.
 */
export function useSearchStream() {
  const [progress, setProgress] = useState(IDLE)
  const controllerRef = useRef(null)

  const start = useCallback(async (body) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setProgress({ topic: body.topic, stage: 'discovering', providers: [], progress: null, summary: '', sourceCount: 0, startedAt: Date.now() })
    try {
      return await streamApi('/news/search/stream', {
        body,
        signal: controller.signal,
        onEvent: (type, data) => controllerRef.current === controller && setProgress((s) => reduce(s, type, data)),
      })
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setProgress(IDLE)
      }
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return { progress, start, cancel }
}
