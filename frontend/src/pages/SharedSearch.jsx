import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ResultView } from '../components/ResultView.jsx'
import { Logo } from '../components/icons.jsx'
import { Alert, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/useAuth.js'

/** Public, read-only view of a search someone shared (/s/:shareId). Works signed in or out. */
export default function SharedSearch() {
  const { shareId } = useParams()
  const { user } = useAuth()
  const [loaded, setLoaded] = useState({ shareId: null, result: null, error: '' })

  useEffect(() => {
    let cancelled = false
    api(`/public/searches/${encodeURIComponent(shareId)}`, { auth: false })
      .then((result) => !cancelled && setLoaded({ shareId, result, error: '' }))
      .catch((err) => !cancelled && setLoaded({ shareId, result: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [shareId])

  const current = loaded.shareId === shareId ? loaded : { result: null, error: '' }

  return (
    <div className="shared-page">
      <header className="shared-header">
        <Link to="/" className="brand">
          <Logo size={26} />
          <span>
            Made with <span className="gradient-text">StayUpdated</span>
          </span>
        </Link>
        {user ? (
          <Link to="/" className="btn btn-secondary btn-sm">
            Open StayUpdated
          </Link>
        ) : (
          <Link to="/signup" className="btn btn-primary btn-sm">
            Sign up free
          </Link>
        )}
      </header>
      <main className="page">
        <Alert>{current.error}</Alert>
        {!current.result && !current.error && (
          <div className="center pad">
            <Spinner size={26} />
          </div>
        )}
        {current.result && <ResultView result={current.result} readOnly />}
        {current.result && !user && (
          <div className="shared-cta panel">
            <div>
              <strong>Get summaries like this on any topic</strong>
              <p className="muted small">StayUpdated searches news, social media and YouTube, verifies every source, and summarizes it with citations.</p>
            </div>
            <Link to="/signup" className="btn btn-primary">
              Create a free account
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
