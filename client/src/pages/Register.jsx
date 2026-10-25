import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { Field } from '../components/Field.jsx'
import { FormError } from '../components/FormError.jsx'
import { Wordmark } from '../components/BrandMark.jsx'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [name, setName] = useState('')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setApiError('')

    const next = {}
    if (name.trim().length < 2) next.name = 'Enter your full name'
    if (!email.trim()) next.email = 'Email is required'
    if (password.length < 8) next.password = 'Password must be at least 8 characters'
    if (Object.keys(next).length) {
      setFieldErrors(next)
      return
    }

    setSubmitting(true)
    try {
      await register(name, email, password)
      navigate('/dashboard', { replace: true })
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
            <h1 className="text-2xl font-medium leading-tight text-ink">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted">
              One account keeps your interviews, scores and feedback together.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormError message={apiError} />
          <Field
            id="name"
            label="Full name"
            value={name}
            onChange={setName}
            error={fieldErrors.name}
            autoComplete="name"
            autoFocus
            disabled={submitting}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            autoComplete="email"
            disabled={submitting}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            hint="At least 8 characters, with a letter and a number"
            autoComplete="new-password"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 h-10 rounded-[6px] bg-primary text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-ink underline underline-offset-2 hover:opacity-80">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
