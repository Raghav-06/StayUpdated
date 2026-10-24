import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { FollowsContext } from './useFollows.js'

const sameTopic = (a, b) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

// Followed topics for the sidebar, Follow buttons and the Following page.
export function FollowsProvider({ children }) {
  const [follows, setFollows] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setFollows((await api('/follows')).follows)
    } catch {
      /* sidebar stays as-is; pages show their own errors */
    } finally {
      setLoading(false)
    }
  }, [])

  const follow = useCallback(async ({ topic, region, params, searchId }) => {
    const { follow: created } = await api('/follows', { method: 'POST', body: { topic, region, params, searchId } })
    setFollows((list) => (list.some((f) => f.id === created.id) ? list : [...list, created]))
    return created
  }, [])

  const unfollow = useCallback(async (id) => {
    await api(`/follows/${id}`, { method: 'DELETE' })
    setFollows((list) => list.filter((f) => f.id !== id))
  }, [])

  const findFollow = useCallback(
    (topic, region) => follows.find((f) => f.region === region && sameTopic(f.topic, topic)) ?? null,
    [follows],
  )

  useEffect(() => {
    // Fetching on mount syncs with the server, which is what effects are for.
    // oxlint-disable-next-line react/set-state-in-effect
    reload()
  }, [reload])

  const value = useMemo(
    () => ({ follows, loading, reload, follow, unfollow, findFollow }),
    [follows, loading, reload, follow, unfollow, findFollow],
  )
  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>
}
