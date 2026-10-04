import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { googleSignInUrl } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { ChatIcon, GoogleLogo, Logo, NewsIcon, PlayIcon, SparkIcon } from './icons.jsx'

const FEATURES = [
  [NewsIcon, 'News sites & Google', 'Bing, Google News, DuckDuckGo, GDELT and more'],
  [ChatIcon, 'Social pulse', 'Reddit, Bluesky, Mastodon and Hacker News'],
  [PlayIcon, 'Video coverage', 'Recent YouTube reports on your topic'],
  [SparkIcon, 'AI-verified', 'Every source relevance-checked, then summarized with citations'],
]

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="glow glow-a" />
        <div className="glow glow-b" />
        <Link to="/" className="brand">
          <Logo size={34} />
          <span>StayUpdated</span>
        </Link>
        <div className="auth-brand-body">
          <h2>
            The latest on anything,
            <br />
            <span className="gradient-text">verified and summarized.</span>
          </h2>
          <ul className="feature-list">
            {FEATURES.map(([Icon, name, desc]) => (
              <li key={name}>
                <span className="feature-icon">
                  <Icon />
                </span>
                <div>
                  <strong>{name}</strong>
                  <p>{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="brand brand-mobile">
            <Logo size={30} />
            <span>StayUpdated</span>
          </Link>
          <h1>{title}</h1>
          {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export function GoogleButton({ label = 'Continue with Google' }) {
  const { googleEnabled } = useAuth()
  const [redirecting, setRedirecting] = useState(false)
  const [notice, setNotice] = useState('')

  // Coming back with the browser's Back button restores this page from cache; re-enable the button.
  useEffect(() => {
    const reset = (e) => e.persisted && setRedirecting(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  function onClick(e) {
    if (googleEnabled === false) {
      e.preventDefault()
      setNotice('Google sign-in is not available right now. Please use your email instead.')
      return
    }
    // A full-page navigation: the backend redirects to Google, which redirects back to /auth/callback.
    setRedirecting(true)
  }

  return (
    <>
      <a
        className="btn btn-google"
        href={googleSignInUrl}
        onClick={onClick}
        aria-disabled={redirecting || undefined}
      >
        <GoogleLogo />
        {redirecting ? 'Redirecting to Google…' : label}
      </a>
      {notice && (
        <p className="muted google-notice" role="status">
          {notice}
        </p>
      )}
    </>
  )
}

export function Divider({ children = 'or' }) {
  return (
    <div className="divider">
      <span>{children}</span>
    </div>
  )
}
