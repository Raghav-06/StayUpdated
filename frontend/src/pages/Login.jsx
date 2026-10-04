import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell, Divider, GoogleButton } from '../components/AuthShell.jsx'
import { Alert, Button, Field, PasswordInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.error ?? '')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      signIn(await api('/auth/login', { method: 'POST', body: { email, password }, auth: false }))
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to get the latest on any topic."
      footer={
        <>
          New to StayUpdated? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <GoogleButton />
      <Divider>or sign in with email</Divider>
      <form onSubmit={submit} className="form">
        <Alert>{error}</Alert>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
            autoFocus
          />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} placeholder="Your password" required />
        </Field>
        <div className="form-row-end">
          <Link to="/forgot-password" className="link-subtle">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="btn-block">
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
