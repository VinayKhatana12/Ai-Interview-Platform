import { useState } from 'react'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Field } from '../components/Field.jsx'
import { FormError } from '../components/FormError.jsx'
import { EXPERIENCE_LABELS } from '../utils/format.js'

// Profile: the account facts the server holds, plus the two fields the user
// may edit (name, experience level). One Save per panel (app-screens §8.2),
// with a quiet "Saved" stamp.
export default function Profile() {
  const { user, updateMe } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [experienceLevel, setExperienceLevel] = useState(user?.experienceLevel ?? '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setApiError('')
    setSaved(false)

    if (name.trim().length < 2) {
      setFieldErrors({ name: 'Name must be at least 2 characters' })
      return
    }

    setSaving(true)
    try {
      await updateMe({ name: name.trim(), experienceLevel: experienceLevel || null })
      setSaved(true)
    } catch (err) {
      if (err.details) setFieldErrors(err.details)
      else setApiError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Profile</h1>
        <p className="mt-1.5 text-sm text-muted">Your account details.</p>
      </div>

      <section className="rounded-[8px] border border-line bg-surface">
        <dl className="divide-y divide-rule px-5">
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted">Email</dt>
            <dd className="text-sm text-ink">{user?.email}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted">Role</dt>
            <dd className="text-sm text-ink">{user?.role?.toLowerCase()}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3.5">
            <dt className="text-sm text-muted">Member since</dt>
            <dd className="text-sm text-ink tnum">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-[8px] border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-medium text-ink">Preferences</h2>
        <FormError message={apiError} />
        <Field
          id="profile-name"
          label="Full name"
          value={name}
          onChange={(v) => {
            setName(v)
            setSaved(false)
          }}
          error={fieldErrors.name}
          autoComplete="name"
          disabled={saving}
        />
        <Field
          id="profile-experience"
          label="Experience level"
          value={experienceLevel}
          onChange={(v) => {
            setExperienceLevel(v)
            setSaved(false)
          }}
          disabled={saving}
        >
          <option value="">Not set</option>
          {Object.entries(EXPERIENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>
        <div className="flex items-center gap-4 border-t border-rule pt-5">
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <p role="status" className="text-sm text-muted">
              Saved
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
