import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useFollows } from '../lib/follows.jsx'
import { preferredRegion } from '../lib/regions.js'
import { useAuth } from '../lib/auth.jsx'
import { BellIcon, CheckIcon } from './icons.jsx'

/** "Follow" / "Following ✓" for a saved search's topic and region. */
export function FollowButton({ result }) {
  const { user, updateUser } = useAuth()
  const { findFollow, follow, unfollow } = useFollows()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { kind, text, link? }

  const region = result.params?.region ?? preferredRegion(user)
  const current = findFollow(result.topic, region)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(id)
  }, [notice])

  async function toggle() {
    setBusy(true)
    setNotice(null)
    try {
      if (current) {
        await unfollow(current.id)
      } else {
        const { maxSources, maxPosts, maxVideos, maxAgeDays } = result.params ?? {}
        await follow({ topic: result.topic, region, params: { maxSources, maxPosts, maxVideos, maxAgeDays }, searchId: result.id })
        // A first follow turns the digest on server-side; pick that up for Settings.
        if (user.preferences?.digestEnabled === undefined) api('/auth/me').then((data) => updateUser(data.user), () => {})
        setNotice({ kind: 'ok', text: "Following. New stories will come in your daily digest.", link: true })
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="menu-wrap">
      <button
        className={`btn btn-ghost ${current ? 'following' : ''}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={Boolean(current)}
        title={current ? 'Unfollow this topic' : 'Get new stories on this topic in a daily email'}
      >
        {current ? (
          <>
            <CheckIcon width={16} height={16} /> Following
          </>
        ) : (
          <>
            <BellIcon width={16} height={16} /> Follow
          </>
        )}
      </button>
      {notice && (
        <div className={`menu-notice ${notice.kind}`} role="status">
          {notice.text}
          {notice.link && (
            <Link to="/following" className="small">
              Manage
            </Link>
          )}
          <button className="link-btn small" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
