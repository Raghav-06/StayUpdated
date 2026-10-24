import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell, Divider, GoogleButton } from '../components/AuthShell.jsx'
import { EmailCodeFlow } from '../components/EmailCodeFlow.jsx'
import { Spinner } from '../components/ui.jsx'
import { useAuth } from '../lib/useAuth.js'

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

/** Google redirects here (via the backend) with #status=...&token=... or #error=... */
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

    if (error) {
      navigate('/login', { replace: true, state: { error } })
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
