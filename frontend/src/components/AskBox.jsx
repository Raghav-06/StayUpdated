import { useEffect, useRef, useState } from 'react'
import { api, streamApi } from '../lib/api.js'
import { ArrowRightIcon, ChatIcon } from './icons.jsx'
import { Summary } from './Summary.jsx'
import { Alert, Button } from './ui.jsx'

function QA({ question, answer, sourceCount, onCite, streaming = false }) {
  return (
    <div className={`qa ${streaming ? 'streaming' : ''}`}>
      <p className="qa-question">{question}</p>
      <div className="qa-answer">
        {answer ? <Summary text={answer} sourceCount={sourceCount} onCite={onCite} /> : <span className="muted small">Thinking…</span>}
      </div>
    </div>
  )
}

/** "Ask about this": follow-up questions answered only from this search's sources. */
export function AskBox({ searchId, sourceCount, limited, onCite }) {
  const [questions, setQuestions] = useState([])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(null) // { question, answer } while streaming
  const [error, setError] = useState('')
  const controllerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api(`/news/history/${searchId}/questions`)
      .then((data) => !cancelled && setQuestions(data.questions))
      .catch(() => {})
    return () => {
      cancelled = true
      controllerRef.current?.abort()
    }
  }, [searchId])

  async function ask(e) {
    e.preventDefault()
    const text = question.trim()
    if (text.length < 3) return setError('Please ask a slightly longer question.')
    setError('')
    setPending({ question: text, answer: '' })
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const saved = await streamApi(`/news/history/${searchId}/ask`, {
        body: { question: text },
        signal: controller.signal,
        onEvent: (type, data) => type === 'delta' && setPending((p) => ({ ...p, answer: p.answer + data.delta })),
      })
      setQuestions((list) => [...list, saved])
      setQuestion('')
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setPending(null)
      controllerRef.current = null
    }
  }

  return (
    <section className="panel ask-panel">
      <div className="panel-title">
        <ChatIcon width={16} height={16} /> Ask about this
      </div>
      {questions.map((qa) => (
        <QA key={qa.id} question={qa.question} answer={qa.answer} sourceCount={sourceCount} onCite={onCite} />
      ))}
      {pending && <QA question={pending.question} answer={pending.answer} sourceCount={sourceCount} onCite={onCite} streaming />}
      <Alert>{error}</Alert>
      <form className="ask-form" onSubmit={ask}>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={questions.length ? 'Ask another question…' : 'e.g. “What happens next?” or “Who is involved?”'}
          maxLength={500}
          disabled={Boolean(pending)}
        />
        <Button type="submit" loading={Boolean(pending)} aria-label="Ask">
          <ArrowRightIcon />
        </Button>
      </form>
      <p className="disclaimer">
        Answers use only the sources below{limited ? ' (short excerpts for this older search, so answers may be limited)' : ''}.
      </p>
    </section>
  )
}
