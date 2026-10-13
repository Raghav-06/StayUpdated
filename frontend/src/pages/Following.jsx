import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, TrashIcon } from '../components/icons.jsx'
import { Alert, Button, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { useFollows } from '../lib/follows.jsx'
import { formatDate, timeAgo } from '../lib/format.js'
import { regionLabel } from '../lib/regions.js'

export default function Following() {
  const { user } = useAuth()
  const { follows, loading, unfollow } = useFollows()
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const digestOn = user.preferences?.digestEnabled === true

  async function handleUnfollow(f) {
    if (!window.confirm(`Stop following “${f.topic}”?`)) return
    setError('')
    try {
      await unfollow(f.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function sendNow() {
    setError('')
    setSent('')
    setSending(true)
    try {
      setSent((await api('/follows/digest-now', { method: 'POST' })).message)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <div>
          <p className="eyebrow">Daily digest</p>
          <h1>Following</h1>
        </div>
        {follows.length > 0 && (
          <Button onClick={sendNow} loading={sending} variant="secondary">
            Send me my digest now
          </Button>
        )}
      </header>

      <p className="muted following-intro">
        {digestOn ? (
          <>Every morning we search these topics and email you only the stories you haven't seen yet.</>
        ) : (
          <>
            The daily digest is off, so you won't get emails. Turn it on in <Link to="/settings">Settings</Link>.
          </>
        )}{' '}
        You can follow up to 10 topics.
      </p>

      <Alert>{error}</Alert>
      <Alert kind="success">{sending ? '' : sent}</Alert>
      {sending && <p className="muted small">Searching your topics. This can take a minute…</p>}

      {loading && (
        <div className="center pad">
          <Spinner />
        </div>
      )}

      {!loading && follows.length === 0 && (
        <div className="empty panel">
          <BellIcon width={28} height={28} />
          <h2>You're not following any topics</h2>
          <p className="muted">Search a topic, then press “Follow” on the result to get its new stories by email.</p>
          <Link to="/" className="btn btn-primary">
            Search a topic
          </Link>
        </div>
      )}

      <ul className="history-cards">
        {follows.map((f) => (
          <li key={f.id} className="history-card panel">
            <Link to={f.last_search_id ? `/history/${f.last_search_id}` : '/'} className="history-card-link">
              <div className="history-card-top">
                <h3>{f.topic}</h3>
                <span className="tag">{regionLabel(f.region)}</span>
              </div>
              <span className="muted small" title={f.last_checked_at ? formatDate(f.last_checked_at) : undefined}>
                {f.last_checked_at ? `Last checked ${timeAgo(f.last_checked_at)}` : 'Not checked yet'} · following since{' '}
                {formatDate(f.created_at)}
              </span>
            </Link>
            <button className="icon-btn danger" onClick={() => handleUnfollow(f)} aria-label={`Unfollow ${f.topic}`} title="Unfollow">
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
