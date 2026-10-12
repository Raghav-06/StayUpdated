import { useState } from 'react'
import { Avatar } from '../components/AppLayout.jsx'
import { GoogleLogo, LogoutIcon, TrashIcon } from '../components/icons.jsx'
import { Alert, Button, Field, PasswordInput, passwordIsValid } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { preferredRegion, REGIONS } from '../lib/regions.js'

// Runs a settings action and keeps its own busy / success / error state.
function useAction() {
  const [state, setState] = useState({ busy: false, ok: '', error: '' })
  async function run(fn, okMessage) {
    setState({ busy: true, ok: '', error: '' })
    try {
      await fn()
      setState({ busy: false, ok: okMessage, error: '' })
    } catch (err) {
      setState({ busy: false, ok: '', error: err.message })
    }
  }
  return [state, run]
}

function Section({ title, description, children, danger = false }) {
  return (
    <section className={`panel settings-section ${danger ? 'danger-zone' : ''}`}>
      <div className="settings-section-head">
        <h2>{title}</h2>
        {description && <p className="muted small">{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}

function Status({ state }) {
  return (
    <>
      <Alert>{state.error}</Alert>
      <Alert kind="success">{state.ok}</Alert>
    </>
  )
}

function Profile() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user.name ?? '')
  const [state, run] = useAction()

  const save = (e) => {
    e.preventDefault()
    run(async () => updateUser((await api('/account', { method: 'PATCH', body: { name } })).user), 'Profile saved')
  }

  return (
    <Section title="Profile">
      <div className="profile-row">
        <Avatar user={user} />
        <div className="profile-email">
          <strong>{user.email}</strong>
          {user.has_google && (
            <span className="tag">
              <GoogleLogo width={12} height={12} /> Signed in with Google
            </span>
          )}
        </div>
      </div>
      <form className="form" onSubmit={save}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
        </Field>
        <Status state={state} />
        <div>
          <Button type="submit" loading={state.busy} disabled={name.trim() === (user.name ?? '')}>
            Save
          </Button>
        </div>
      </form>
    </Section>
  )
}

function Preferences() {
  const { user, updateUser } = useAuth()
  const [state, run] = useAction()

  const save = (preferences, message) =>
    run(async () => updateUser((await api('/account', { method: 'PATCH', body: { preferences } })).user), message)

  return (
    <Section title="Search defaults" description="Used for new searches. You can still change them per search.">
      <Field label="Default region">
        <select
          className="input"
          value={preferredRegion(user)}
          disabled={state.busy}
          onChange={(e) => save({ region: e.target.value }, 'Default region saved')}
        >
          {REGIONS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Status state={state} />
    </Section>
  )
}

function ChangePassword() {
  const { user, signIn } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [state, run] = useAction()

  if (!user.has_password) {
    return (
      <Section title="Password">
        <p className="muted settings-note">
          You sign in with Google, so your account has no password yet. To add one, sign out and use{' '}
          <strong>Forgot password</strong> on the sign-in page with {user.email}.
        </p>
      </Section>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      signIn(await api('/account/password', { method: 'POST', body: { currentPassword: current, newPassword: next } }))
      setCurrent('')
      setNext('')
    }, 'Password changed. Other devices have been signed out.')
  }

  return (
    <Section title="Change password" description="Changing it signs you out on every other device.">
      <form className="form" onSubmit={submit}>
        <Field label="Current password">
          <PasswordInput value={current} onChange={setCurrent} required />
        </Field>
        <Field label="New password">
          <PasswordInput value={next} onChange={setNext} showRules autoComplete="new-password" required />
        </Field>
        <Status state={state} />
        <div>
          <Button type="submit" loading={state.busy} disabled={!current || !passwordIsValid(next)}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  )
}

function Sessions() {
  const { signOut } = useAuth()
  const [state, run] = useAction()

  const logoutAll = () => {
    if (!window.confirm('Sign out on every device, including this one?')) return
    run(async () => {
      await api('/account/logout-all', { method: 'POST' })
      signOut()
    }, '')
  }

  return (
    <Section title="Sessions" description="Lost a device or used a shared computer? End every session at once.">
      <Status state={state} />
      <div>
        <Button variant="secondary" loading={state.busy} onClick={logoutAll}>
          <LogoutIcon width={16} height={16} /> Sign out of all devices
        </Button>
      </div>
    </Section>
  )
}

function DeleteAccount() {
  const { user, signOut } = useAuth()
  const [confirmEmail, setConfirmEmail] = useState('')
  const [state, run] = useAction()
  const matches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase()

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api('/account', { method: 'DELETE', body: { confirmEmail } })
      signOut()
    }, '')
  }

  return (
    <Section
      title="Delete account"
      description="Permanently deletes your account, search history, questions and followed topics. This can't be undone."
      danger
    >
      <form className="form" onSubmit={submit}>
        <Field label={`Type ${user.email} to confirm`}>
          <input
            className="input"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={user.email}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Status state={state} />
        <div>
          <Button type="submit" variant="danger" loading={state.busy} disabled={!matches}>
            <TrashIcon width={16} height={16} /> Delete my account
          </Button>
        </div>
      </form>
    </Section>
  )
}

export default function Settings() {
  return (
    <div className="page page-narrow">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settings">
        <Profile />
        <Preferences />
        <ChangePassword />
        <Sessions />
        <DeleteAccount />
      </div>
    </div>
  )
}
