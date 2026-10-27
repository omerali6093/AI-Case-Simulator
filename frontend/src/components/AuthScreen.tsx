import { useState, useEffect, useRef } from 'react'
import type { Progress } from '../types'
import { clinicAPI } from '../api'
import { loadLastUser } from '../utils'

interface Props {
  onEnter: (username: string, progress: Progress) => void
  leaving: boolean
}

export function AuthScreen({ onEnter, leaving }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState(loadLastUser() ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({ user: '', pass: '', conf: '', form: '' })
  const [busy, setBusy] = useState(false)
  const [authNote, setAuthNote] = useState('Checking for the clinic server…')
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    clinicAPI.ready.then((mode) => {
      setAuthNote(
        mode === 'remote'
          ? 'Your progress and records are saved to your account on the clinic server.'
          : 'Offline demo: no server found, so nothing leaves this page. Use any username (3+ characters) and an 8+ character password.'
      )
    })
  }, [])

  function clearErrors() {
    setErrors({ user: '', pass: '', conf: '', form: '' })
  }

  function validUser(v: string) {
    const t = v.trim()
    if (t.length < 3 || t.length > 24) return 'Username must be 3-24 characters.'
    if (!/^[A-Za-z0-9_]+$/.test(t)) return 'Use letters, numbers and underscores only.'
    return ''
  }

  function validPass(v: string) {
    if (v.length < 8) return 'Password must be at least 8 characters.'
    if (v.length > 128) return 'Password must be 128 characters or fewer.'
    return ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const reg = tab === 'register'
    const eu = validUser(username)
    const ep = validPass(password)
    const ec = reg && confirm !== password ? 'Passwords do not match.' : ''
    setErrors({ user: eu, pass: ep, conf: reg ? ec : '', form: '' })
    if (eu || ep || (reg && ec)) return

    setBusy(true)
    try {
      const res = await clinicAPI[reg ? 'register' : 'login'](username.trim(), password)
      setBusy(false)
      onEnter(res.user.username, res.progress)
    } catch (err: unknown) {
      setBusy(false)
      const e = err as { message?: string; status?: number }
      const m = e?.message ?? 'Could not sign in. Try again.'
      if (e?.status === 409) setErrors((prev) => ({ ...prev, user: m }))
      else setErrors((prev) => ({ ...prev, form: m }))
    }
  }

  function switchTab(t: 'login' | 'register') {
    setTab(t)
    clearErrors()
    setPassword('')
    setConfirm('')
  }

  return (
    <section
      className={`auth${leaving ? ' leaving' : ''}`}
      id="auth"
      aria-label="Sign in"
    >
      <header className="brand">
        <div className="brand-row">
          <span className="mark" aria-hidden="true"><i /></span>
          <h1>Clinic Simulator</h1>
        </div>
        <p>Interview fictional patients, choose a next step and learn from the feedback.</p>
      </header>

      <div className="glass card">
        <div className="tabs" role="tablist">
          <button
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === 'login'}
            onClick={() => switchTab('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === 'register'}
            onClick={() => switchTab('register')}
          >
            Create account
          </button>
        </div>

        <form className="form" noValidate onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="f-user">Username</label>
            <input
              id="f-user"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={errors.user ? 'true' : undefined}
            />
            {errors.user && <p className="err" role="alert">{errors.user}</p>}
          </div>

          <div className="field">
            <label htmlFor="f-pass">Password</label>
            <input
              id="f-pass"
              name="password"
              type="password"
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errors.pass ? 'true' : undefined}
            />
            {errors.pass && <p className="err" role="alert">{errors.pass}</p>}
          </div>

          {tab === 'register' && (
            <div className="field">
              <label htmlFor="f-conf">Confirm password</label>
              <input
                id="f-conf"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={errors.conf ? 'true' : undefined}
              />
              {errors.conf && <p className="err" role="alert">{errors.conf}</p>}
            </div>
          )}

          {errors.form && <p className="err" role="alert">{errors.form}</p>}

          <button
            ref={btnRef}
            type="submit"
            className="btn primary"
            disabled={busy}
          >
            {busy
              ? tab === 'register' ? 'Creating account…' : 'Signing in…'
              : tab === 'register' ? 'Create account and start shift' : 'Sign in and start shift'}
          </button>
        </form>

        <p className="auth-note">{authNote}</p>
      </div>
    </section>
  )
}
