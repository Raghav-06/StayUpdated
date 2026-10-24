import { useState } from 'react'
import { PASSWORD_RULES } from '../lib/password.js'
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon } from './icons.jsx'

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />
}

export function Button({ loading, children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner size={16} /> : children}
    </button>
  )
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? <AlertIcon /> : <CheckIcon />}
      <span>{children}</span>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function PasswordInput({ value, onChange, showRules = false, autoComplete = 'current-password', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <div className="input-wrap">
        <input
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          {...props}
        />
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {showRules && (
        <ul className="pw-rules">
          {PASSWORD_RULES.map(([label, test]) => (
            <li key={label} className={test(value) ? 'ok' : ''}>
              <CheckIcon width={14} height={14} /> {label}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
