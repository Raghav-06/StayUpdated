import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResultView } from '../components/ResultView.jsx'
import { SearchProgress } from '../components/SearchProgress.jsx'
import { ArrowRightIcon, SearchIcon, SlidersIcon } from '../components/icons.jsx'
import { Alert, Button } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useHistory } from '../lib/history.jsx'
import { preferredRegion, REGIONS } from '../lib/regions.js'
import { useSearchStream } from '../lib/useSearchStream.js'

const SUGGESTIONS = ['Artificial intelligence', 'Electric vehicles', 'Climate change', 'Stock market', 'Champions League', 'Space exploration']

const TIME_RANGES = [
  [1, 'Past 24 hours'],
  [3, 'Past 3 days'],
  [7, 'Past week'],
  [30, 'Past month'],
]

export default function Home() {
  const { user } = useAuth()
  const { reload } = useHistory()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [topic, setTopic] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [maxAgeDays, setMaxAgeDays] = useState(7)
  const [region, setRegion] = useState(() => preferredRegion(user))
  const [maxSources, setMaxSources] = useState(6)
  const [maxPosts, setMaxPosts] = useState(5)
  const [maxVideos, setMaxVideos] = useState(3)
  const [urls, setUrls] = useState('')

  const { progress, start, cancel } = useSearchStream()
  const searching = progress?.topic ?? ''
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function search(e, preset) {
    e?.preventDefault()
    const query = (preset ?? topic).trim()
    if (!query) return inputRef.current?.focus()
    setTopic(query)
    setError('')
    setResult(null)
    try {
      const extraUrls = urls
        .split(/\s+/)
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//.test(u))
      const data = await start({ topic: query, region, maxAgeDays, maxSources, maxPosts, maxVideos, urls: extraUrls })
      // The saved search gets its own page; pass the full result (including what was filtered out).
      // Empty results aren't saved, so they have no id and are shown inline.
      if (data.id) {
        reload()
        navigate(`/history/${data.id}`, { state: { result: data } })
      } else setResult(data)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    }
  }

  const firstName = (user.name || '').split(' ')[0]

  return (
    <div className="page">
      <section className={`hero ${result || searching ? 'hero-compact' : ''}`}>
        {!result && !searching && (
          <>
            <div className="glow glow-hero" />
            <p className="eyebrow">{firstName ? `Hi ${firstName}` : 'Welcome'}</p>
            <h1 className="hero-title">
              What do you want to <span className="gradient-text">stay updated</span> on?
            </h1>
            <p className="muted hero-sub">
              We search news sites, Google, social media and YouTube, check every source with AI, and summarize what's
              new.
            </p>
          </>
        )}

        <form className="search-box" onSubmit={search}>
          <SearchIcon className="search-icon" />
          <input
            ref={inputRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic, e.g. “AI regulation in Europe”"
            maxLength={200}
            disabled={Boolean(searching)}
            autoFocus
          />
          <button
            type="button"
            className={`icon-btn ${showOptions ? 'active' : ''}`}
            onClick={() => setShowOptions((v) => !v)}
            title="Search options"
            aria-label="Search options"
            aria-expanded={showOptions}
          >
            <SlidersIcon />
          </button>
          <Button type="submit" loading={Boolean(searching)} className="search-submit">
            <span className="hide-sm">Search</span> <ArrowRightIcon />
          </Button>
        </form>

        {showOptions && (
          <div className="options panel">
            <label className="option option-half">
              <span>Region</span>
              <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="option option-half">
              <span>Time range</span>
              <select className="input" value={maxAgeDays} onChange={(e) => setMaxAgeDays(Number(e.target.value))}>
                {TIME_RANGES.map(([days, label]) => (
                  <option key={days} value={days}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['News articles', maxSources, setMaxSources, 1],
              ['Social posts', maxPosts, setMaxPosts, 0],
              ['Videos', maxVideos, setMaxVideos, 0],
            ].map(([label, value, set, min]) => (
              <label key={label} className="option">
                <span>
                  {label} <strong>{value}</strong>
                </span>
                <input type="range" min={min} max={10} value={value} onChange={(e) => set(Number(e.target.value))} />
              </label>
            ))}
            <label className="option option-wide">
              <span>Also read these URLs (optional, one per line)</span>
              <textarea
                className="input"
                rows={2}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://example.com/article"
              />
            </label>
          </div>
        )}

        {!result && !searching && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => search(null, s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="page-body">
        <Alert>{error}</Alert>
        {progress && <SearchProgress progress={progress} onCancel={cancel} />}
        {result && <ResultView result={result} />}
      </div>
    </div>
  )
}
