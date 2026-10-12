import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ResultView } from '../components/ResultView.jsx'
import { SearchProgress } from '../components/SearchProgress.jsx'
import { ShareMenu } from '../components/ShareMenu.jsx'
import { ClockIcon, PlusIcon, RefreshIcon, TrashIcon } from '../components/icons.jsx'
import { Alert, Button, Spinner } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { formatDate, timeAgo } from '../lib/format.js'
import { useHistory } from '../lib/history.jsx'
import { useSearchStream } from '../lib/useSearchStream.js'

const PAGE_SIZE = 20

export function HistoryList() {
  const { remove } = useHistory()
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(offset) {
    setLoading(true)
    try {
      const data = await api(`/news/history?limit=${PAGE_SIZE}&offset=${offset}`)
      setItems((prev) => (offset ? [...prev, ...data.searches] : data.searches))
      setHasMore(data.searches.length === PAGE_SIZE)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(0)
  }, [])

  async function handleDelete(id) {
    if (!window.confirm('Delete this search from your history?')) return
    try {
      await remove(id)
      setItems((list) => list.filter((s) => s.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your library</p>
          <h1>Search history</h1>
        </div>
        <Link to="/" className="btn btn-primary">
          <PlusIcon /> New search
        </Link>
      </header>

      <Alert>{error}</Alert>

      {!loading && items.length === 0 && !error && (
        <div className="empty panel">
          <ClockIcon width={28} height={28} />
          <h2>No searches yet</h2>
          <p className="muted">Every topic you search is saved here with its summary and sources.</p>
          <Link to="/" className="btn btn-primary">
            Search your first topic
          </Link>
        </div>
      )}

      <ul className="history-cards">
        {items.map((s) => (
          <li key={s.id} className="history-card panel">
            <Link to={`/history/${s.id}`} className="history-card-link">
              <div className="history-card-top">
                <h3>{s.topic}</h3>
                <span className="muted small" title={formatDate(s.created_at)}>
                  {timeAgo(s.created_at)}
                </span>
              </div>
              {s.summary_preview && <p className="muted history-preview">{s.summary_preview}…</p>}
              <span className="tag">{s.source_count} sources</span>
            </Link>
            <button className="icon-btn danger" onClick={() => handleDelete(s.id)} aria-label="Delete search" title="Delete">
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <div className="center pad">
          <Spinner />
        </div>
      )}
      {hasMore && !loading && (
        <div className="center">
          <Button variant="secondary" onClick={() => load(items.length)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

export function HistoryDetail() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { remove, reload } = useHistory()
  const { progress, start, cancel } = useSearchStream()
  // Kept per search, so it doesn't follow the user to another page.
  const [refreshFailure, setRefreshFailure] = useState({ id: null, message: '' })
  const refreshError = refreshFailure.id === id ? refreshFailure.message : ''
  // A search that just finished arrives with its full result; otherwise load the saved copy.
  const fresh = location.state?.result?.id === id ? location.state.result : null
  const [loaded, setLoaded] = useState({ id: null, result: null, error: '' })

  useEffect(() => {
    if (fresh) return
    let cancelled = false
    api(`/news/history/${id}`)
      .then((result) => !cancelled && setLoaded({ id, result, error: '' }))
      .catch((err) => !cancelled && setLoaded({ id, result: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [id, fresh])

  const result = fresh ?? (loaded.id === id ? loaded.result : null)
  const error = loaded.id === id ? loaded.error : ''

  async function handleDelete() {
    if (!window.confirm('Delete this search from your history?')) return
    await remove(id)
    navigate('/history', { replace: true })
  }

  // Runs the same search again (skipping the cache) and marks what's new since this one.
  async function handleRefresh() {
    setRefreshFailure({ id: null, message: '' })
    try {
      const { urls = [], ...params } = result.params ?? {}
      const data = await start({ topic: result.topic, ...params, urls, force: true, previousSearchId: id })
      if (data.id) {
        reload()
        navigate(`/history/${data.id}`, { state: { result: data } })
      } else setRefreshFailure({ id, message: data.message || 'Nothing new could be found right now.' })
    } catch (err) {
      if (err.name !== 'AbortError') setRefreshFailure({ id, message: err.message })
    }
  }

  return (
    <div className="page">
      <div className="page-toolbar">
        <Link to="/history" className="link-subtle">
          ← All searches
        </Link>
        {result && !progress && (
          <div className="toolbar-actions">
            <ShareMenu key={id} result={result} />
            <button className="btn btn-ghost" onClick={handleRefresh} title="Search this topic again and highlight new sources">
              <RefreshIcon width={16} height={16} /> Refresh
            </button>
            <button className="btn btn-ghost danger" onClick={handleDelete}>
              <TrashIcon width={16} height={16} /> Delete
            </button>
          </div>
        )}
      </div>
      <Alert>{error || refreshError}</Alert>
      {progress && (
        <div className="page-body">
          <SearchProgress progress={progress} onCancel={cancel} />
        </div>
      )}
      {!result && !error && (
        <div className="center pad">
          <Spinner size={26} />
        </div>
      )}
      {result && !progress && <ResultView key={id} result={result} />}
    </div>
  )
}
