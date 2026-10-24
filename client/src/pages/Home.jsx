import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { BrandMark } from '../components/BrandMark.jsx'

// Signed-in landing screen. Honest by design: it shows the real account data
// from /me and states plainly what arrives next — no placeholder widgets.
export default function Home() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-12 w-full max-w-[1088px] items-center justify-between px-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <BrandMark size={18} />
            Interview Ledger
          </span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="h-8 rounded-[6px] border border-control bg-surface px-3 text-sm text-ink transition-colors hover:bg-raised"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1088px] px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-medium text-ink">Practice</h1>
        <p className="mt-1.5 text-sm text-muted">
          Signed in as {user?.name}. Your interview workspace is being built.
        </p>

        <section className="mt-6 rounded-[8px] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-medium text-ink">Account</h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-sm text-muted">Name</dt>
              <dd className="text-sm text-ink">{user?.name}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-sm text-muted">Email</dt>
              <dd className="text-sm text-ink">{user?.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-sm text-muted">Role</dt>
              <dd className="text-sm text-ink">{user?.role?.toLowerCase()}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-sm text-muted">Member since</dt>
              <dd className="text-sm text-ink tnum">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-muted">
            Interviews, AI-generated questions and scored feedback arrive in the next milestone.
          </p>
        </section>
      </main>
    </div>
  )
}
