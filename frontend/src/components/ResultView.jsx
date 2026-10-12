import { useMemo, useState } from 'react'
import { formatDate, hostname, minutesAgo, timeAgo } from '../lib/format.js'
import { AlertIcon, BookIcon, ChatIcon, CheckIcon, ChevronIcon, ExternalIcon, NewsIcon, PlayIcon, SparkIcon } from './icons.jsx'
import { Summary } from './Summary.jsx'

const KINDS = {
  article: { label: 'News', Icon: NewsIcon },
  post: { label: 'Social', Icon: ChatIcon },
  video: { label: 'Video', Icon: PlayIcon },
  reference: { label: 'Background', Icon: BookIcon },
}

function SourceCard({ source, highlighted }) {
  const { Icon, label } = KINDS[source.kind] ?? KINDS.article
  const when = timeAgo(source.publishedAt)
  const relevance = Math.round((source.relevance ?? 0) * 100)

  return (
    <article id={`source-${source.id}`} className={`source-card kind-${source.kind} ${highlighted ? 'highlight' : ''}`}>
      <div className="source-top">
        <span className="source-num">{source.id}</span>
        <span className={`kind-badge kind-${source.kind}`}>
          <Icon width={13} height={13} /> {label}
        </span>
        <span className="source-outlet">{source.source || hostname(source.url)}</span>
        {when && <span className="source-time">· {when}</span>}
      </div>
      <a className="source-title" href={source.url} target="_blank" rel="noopener noreferrer">
        {source.title || hostname(source.url)}
        <ExternalIcon width={14} height={14} />
      </a>
      {source.excerpt && <p className="source-excerpt">{source.excerpt}</p>}
      <div className="source-bottom">
        <span className="relevance" title="How closely this source matches your topic (AI similarity score)">
          <span className="relevance-bar">
            <span style={{ width: `${Math.min(100, relevance)}%` }} />
          </span>
          {relevance}% match
        </span>
        {source.foundVia && <span className="tag">via {source.foundVia}</span>}
        {source.contentFrom === 'snippet' && (
          <span className="tag tag-warn" title="The page couldn't be read, so its search-result description was used">
            preview only
          </span>
        )}
      </div>
    </article>
  )
}

function ProviderStatus({ status }) {
  const entries = Object.entries(status ?? {})
  if (!entries.length) return null
  const ok = entries.filter(([, s]) => s.ok).length
  return (
    <details className="panel collapsible">
      <summary>
        <ChevronIcon className="chev" width={16} height={16} />
        Where we looked
        <span className="muted small">
          {ok} of {entries.length} sources responded
        </span>
      </summary>
      <ul className="provider-list">
        {entries.map(([name, s]) => (
          <li key={name} className={s.ok ? 'ok' : s.skipped ? 'skipped' : 'failed'}>
            <span className="provider-dot" />
            <span className="provider-name">{name}</span>
            <span className="muted small">
              {s.ok ? `${s.found} found` : s.skipped ? 'not configured' : 'unavailable'}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function Rejected({ items }) {
  if (!items?.length) return null
  return (
    <details className="panel collapsible">
      <summary>
        <ChevronIcon className="chev" width={16} height={16} />
        Filtered out
        <span className="muted small">{items.length} results didn't pass verification</span>
      </summary>
      <ul className="rejected-list">
        {items.slice(0, 60).map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.title || hostname(r.url)}
            </a>
            <span className="muted small">{r.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Shows a search result: either straight from /news/search or a saved row from history. */
export function ResultView({ result }) {
  const sources = useMemo(() => result.sources ?? [], [result.sources])
  const providerStatus = result.providerStatus ?? result.provider_status
  const createdAt = result.createdAt ?? result.created_at
  const [filter, setFilter] = useState('all')
  const [highlight, setHighlight] = useState(null)

  const counts = useMemo(() => {
    const c = {}
    for (const s of sources) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [sources])

  const visible = filter === 'all' ? sources : sources.filter((s) => s.kind === filter)

  function cite(n) {
    setFilter('all')
    setHighlight(n)
    requestAnimationFrame(() =>
      document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
    setTimeout(() => setHighlight(null), 1800)
  }

  return (
    <div className="result">
      <header className="result-header">
        <p className="eyebrow">Latest on</p>
        <h1>{result.topic}</h1>
        <div className="result-meta">
          {createdAt && <span>{formatDate(createdAt)}</span>}
          <span>{sources.length} verified sources</span>
          {result.stats?.tookMs && !result.stats.cached && <span>{(result.stats.tookMs / 1000).toFixed(1)}s</span>}
          {result.stats?.cached && (
            <span>
              <span className="tag" title="An identical search was made recently, so its result was reused">
                cached · {minutesAgo(result.stats.cachedFrom)}
              </span>
            </span>
          )}
        </div>
      </header>

      <section className="panel summary-panel">
        <div className="panel-title">
          <SparkIcon /> AI summary
        </div>
        {result.summary ? (
          <Summary text={result.summary} sourceCount={sources.length} onCite={cite} />
        ) : (
          <div className="empty-inline">
            <AlertIcon />
            <span>{result.message || 'No summary could be generated for this topic.'}</span>
          </div>
        )}
        {result.summary && (
          <p className="disclaimer">
            <CheckIcon width={14} height={14} /> Generated only from the sources below. Click a number to see its source.
          </p>
        )}
      </section>

      {sources.length > 0 && (
        <section>
          <div className="sources-header">
            <h2>Sources</h2>
            <div className="filter-tabs" role="tablist">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                All <span>{sources.length}</span>
              </button>
              {Object.entries(KINDS).map(
                ([kind, { label }]) =>
                  counts[kind] > 0 && (
                    <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>
                      {label} <span>{counts[kind]}</span>
                    </button>
                  ),
              )}
            </div>
          </div>
          <div className="source-grid">
            {visible.map((s) => (
              <SourceCard key={s.id} source={s} highlighted={highlight === s.id} />
            ))}
          </div>
        </section>
      )}

      <div className="result-details">
        <ProviderStatus status={providerStatus} />
        <Rejected items={result.rejected} />
      </div>
    </div>
  )
}
