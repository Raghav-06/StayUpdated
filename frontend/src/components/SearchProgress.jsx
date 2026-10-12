import { useEffect, useState } from 'react'
import { CheckIcon, SparkIcon } from './icons.jsx'
import { Summary } from './Summary.jsx'
import { Button, Spinner } from './ui.jsx'

const STAGES = [
  ['discovering', 'Searching news sites, Google, social media and YouTube'],
  ['reading', 'Reading articles'],
  ['validating', 'Checking every source for relevance'],
  ['summarizing', 'Writing your summary'],
]

function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

function ProviderTicks({ providers }) {
  if (!providers.length) return null
  return (
    <ul className="provider-ticks">
      {providers.map((p) => (
        <li key={p.name} className={p.ok ? 'ok' : p.skipped ? 'skipped' : 'failed'} title={p.error || p.skipped || ''}>
          <span className="provider-dot" />
          {p.name}
          {p.ok && <span className="muted">{p.found}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Live view of a streamed search: real stages, providers as they answer, pages read, and the summary as it's written. */
export function SearchProgress({ progress, onCancel }) {
  const elapsed = useElapsed(progress.startedAt)
  const current = STAGES.findIndex(([key]) => key === progress.stage)
  const pages = progress.progress

  return (
    <>
      <div className="loading-card panel">
        <div className="loading-orb">
          <Spinner size={30} />
        </div>
        <h2>
          Researching <span className="gradient-text">{progress.topic}</span>
        </h2>
        <ol className="stage-list">
          {STAGES.map(([key, label], i) => (
            <li key={key} className={i < current ? 'done' : i === current ? 'active' : ''}>
              <span className="stage-icon">
                {i < current ? <CheckIcon width={14} height={14} /> : i === current ? <Spinner size={12} /> : null}
              </span>
              <span>
                {label}
                {key === 'reading' && pages?.total > 0 && i <= current && (
                  <span className="stage-detail">
                    {' '}
                    · Reading {pages.read}/{pages.total}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {current === 0 && <ProviderTicks providers={progress.providers} />}
        <div className="loading-footer">
          <span className="muted small">{elapsed}s · this usually takes 20–60 seconds</span>
          <Button variant="secondary" className="btn-sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      {progress.summary && (
        <section className="panel summary-panel streaming">
          <div className="panel-title">
            <SparkIcon /> AI summary
          </div>
          <Summary text={progress.summary} sourceCount={progress.sourceCount} onCite={() => {}} />
        </section>
      )}
    </>
  )
}
