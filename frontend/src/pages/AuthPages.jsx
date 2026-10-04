import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell, Divider, GoogleButton } from '../components/AuthShell.jsx'
import { EmailCodeFlow } from '../components/EmailCodeFlow.jsx'
import { Alert, Button, Field, PasswordInput, Spinner, passwordIsValid } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

const GOOGLE_SETUP_KEY = 'su_google_setup'

export function Signup() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start following the topics you care about."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />
      <Divider>or sign up with email</Divider>
      <EmailCodeFlow mode="signup" />
    </AuthShell>
  )
}

export function ForgotPassword() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Verify your email, then choose a new password."
      footer={
        <>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      <EmailCodeFlow mode="reset" />
    </AuthShell>
  )
}

/** Google redirects here (via the backend) with #status=...&token=... or #setupToken=... or #error=... */
export function AuthCallback() {
  const { signInWithToken } = useAuth()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    // Remove tokens from the address bar and browser history right away.
    window.history.replaceState(null, '', window.location.pathname)

    const error = params.get('error')
    const token = params.get('token')
    const setupToken = params.get('setupToken')

    if (error) {
      navigate('/login', { replace: true, state: { error } })
    } else if (setupToken) {
      try {
        sessionStorage.setItem(GOOGLE_SETUP_KEY, setupToken)
      } catch {
        /* falls back to router state */
      }
      navigate('/set-password', { replace: true, state: { setupToken } })
    } else if (token) {
      signInWithToken(token)
        .then(() => navigate('/', { replace: true }))
        .catch((err) => navigate('/login', { replace: true, state: { error: err.message } }))
    } else {
      navigate('/login', { replace: true })
    }
  }, [navigate, signInWithToken])

  return (
    <div className="fullscreen-center">
      <Spinner size={28} />
      <p className="muted">Signing you in…</p>
    </div>
  )
}

/** After the first Google sign-in, every account must also set a password. */
export function SetPassword() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [setupToken] = useState(() => {
    try {
      return location.state?.setupToken || sessionStorage.getItem(GOOGLE_SETUP_KEY)
    } catch {
      return location.state?.setupToken
    }
  })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!setupToken) return <Navigate to="/login" replace />

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    setError('')
    setLoading(true)
    try {
      signIn(await api('/auth/set-password', { method: 'POST', body: { setupToken, password }, auth: false }))
      try {
        sessionStorage.removeItem(GOOGLE_SETUP_KEY)
      } catch {
        /* ignore */
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err.status === 401 ? 'This setup link expired. Please continue with Google again.' : err.message,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="One last step"
      subtitle="Your Google account is connected. Set a password so you can also sign in with your email."
      footer={<Link to="/login">Cancel</Link>}
    >
      <form className="form" onSubmit={submit}>
        <Alert>{error}</Alert>
        <Field label="Create a password">
          <PasswordInput value={password} onChange={setPassword} showRules autoComplete="new-password" required autoFocus />
        </Field>
        <Field label="Confirm password">
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={loading} disabled={!passwordIsValid(password) || !confirm} className="btn-block">
          Finish setup
        </Button>
      </form>
    </AuthShell>
  )
}
