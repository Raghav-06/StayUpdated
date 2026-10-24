import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { HistoryContext } from './useHistory.js'

// Recent searches for the sidebar; reloaded after each new search or delete.
export function HistoryProvider({ children }) {
  const [searches, setSearches] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const data = await api('/news/history?limit=30')
      setSearches(data.searches)
    } catch {
      /* sidebar stays as-is; pages show their own errors */
    } finally {
      setLoading(false)
    }
  }, [])

  const remove = useCallback(async (id) => {
    await api(`/news/history/${id}`, { method: 'DELETE' })
    setSearches((list) => list.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    // Fetching on mount syncs with the server, which is what effects are for.
    // oxlint-disable-next-line react/set-state-in-effect
    reload()
  }, [reload])

  const value = useMemo(() => ({ searches, loading, reload, remove }), [searches, loading, reload, remove])
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
}
