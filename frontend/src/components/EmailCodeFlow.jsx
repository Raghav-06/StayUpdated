import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { CodeInput } from './CodeInput.jsx'
import { Alert, Button, Field, PasswordInput, passwordIsValid } from './ui.jsx'

const RESEND_SECONDS = 60

function Steps({ current }) {
  const labels = ['Email', 'Verify', 'Password']
  return (
    <ol className="steps">
      {labels.map((label, i) => (
        <li key={label} className={i < current ? 'done' : i === current ? 'active' : ''}>
          <span className="step-dot">{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}

/**
 * Shared by sign-up and forgot-password:
 *   email -> 6-digit code -> set password -> signed in
 */
export function EmailCodeFlow({ mode }) {
  const isSignup = mode === 'signup'
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function run(fn) {
    setError('')
    setLoading(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      await api(isSignup ? '/auth/register' : '/auth/forgot-password', {
        method: 'POST',
        body: { email },
        auth: false,
      })
      setCooldown(RESEND_SECONDS)
      setCode('')
      setStep(1)
    })

  const verify = (e) => {
    e?.preventDefault()
    return run(async () => {
      const res = await api('/auth/verify-email', { method: 'POST', body: { email, code }, auth: false })
      setSetupToken(res.setupToken)
      setStep(2)
    })
  }

  const savePassword = (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    return run(async () => {
      signIn(
        await api('/auth/set-password', {
          method: 'POST',
          body: { setupToken, password, name: isSignup ? name : undefined },
          auth: false,
        }),
      )
      navigate('/', { replace: true })
    })
  }

  return (
    <>
      <Steps current={step} />
      <Alert>{error}</Alert>

      {step === 0 && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            sendCode()
          }}
        >
          <Field label="Email" hint="We'll send a 6-digit code to verify it's you.">
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
          <Button type="submit" loading={loading} className="btn-block">
            Send code
          </Button>
        </form>
      )}

      {step === 1 && (
        <form className="form" onSubmit={verify}>
          <p className="muted center">
            Enter the code sent to <strong className="text-strong">{email}</strong>
          </p>
          <CodeInput value={code} onChange={setCode} disabled={loading} />
          <Button type="submit" loading={loading} disabled={code.length !== 6} className="btn-block">
            Verify email
          </Button>
          <div className="form-row-between">
            <button type="button" className="link-btn" onClick={() => setStep(0)}>
              Change email
            </button>
            <button type="button" className="link-btn" disabled={cooldown > 0 || loading} onClick={sendCode}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="form" onSubmit={savePassword}>
          {isSignup && (
            <Field label="Name (optional)">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="What should we call you?"
                maxLength={100}
              />
            </Field>
          )}
          <Field label={isSignup ? 'Create a password' : 'New password'}>
            <PasswordInput value={password} onChange={setPassword} showRules autoComplete="new-password" required autoFocus />
          </Field>
          <Field label="Confirm password">
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" required />
          </Field>
          <Button type="submit" loading={loading} disabled={!passwordIsValid(password) || !confirm} className="btn-block">
            {isSignup ? 'Create account' : 'Reset password'}
          </Button>
        </form>
      )}
    </>
  )
}
