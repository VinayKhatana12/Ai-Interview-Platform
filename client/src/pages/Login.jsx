import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { Field } from '../components/Field.jsx'
import { FormError } from '../components/FormError.jsx'
import { Wordmark } from '../components/BrandMark.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const backTo = location.state?.from?.pathname || '/dashboard'

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setApiError('')

    const next = {}
    if (!email.trim()) next.email = 'Email is required'
    if (!password) next.password = 'Password is required'
    if (Object.keys(next).length) {
      setFieldErrors(next)
      return
    }

    setSubmitting(true)
    try {
      await login(email, password)
      navigate(backTo, { replace: true })
    } catch (err) {
      if (err.details) setFieldErrors(err.details)
      else setApiError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] rounded-[8px] border border-line bg-surface p-6 sm:p-8">
        <div className="mb-8 flex flex-col items-start gap-3">
          <Wordmark />
          <div>
            <h1 className="text-2xl font-medium leading-tight text-ink">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted">
              Practice technical interviews and keep score of every attempt.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormError message={apiError} />
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            autoComplete="email"
            autoFocus
            disabled={submitting}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            autoComplete="current-password"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 h-10 rounded-[6px] bg-primary text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          New here?{' '}
          <Link to="/register" className="text-ink underline underline-offset-2 hover:opacity-80">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  )
}
