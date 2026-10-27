import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { listInterviews, retakeInterview } from '../api/interviews.js'
import { useAsync } from '../hooks/useAsync.js'
import { RowsSkeleton } from '../components/Skeletons.jsx'
import { EmptyState, BlockError } from '../components/States.jsx'
import { InterviewRow } from '../components/InterviewRow.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { Link } from 'react-router-dom'

const PAGE_SIZE = 10

const controlClass =
  'h-8 rounded-[6px] border border-control bg-surface px-2.5 text-sm text-ink hover:border-muted focus:border-muted focus:outline-none'

// History: every interview, with server-side filters (status, role substring,
// created date range) kept in the URL so pagination and sharing preserve them.
export default function History() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [createdNote, setCreatedNote] = useState(location.state?.created ?? null)

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const status = searchParams.get('status') ?? ''
  const role = searchParams.get('role') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const hasFilters = Boolean(status || role || from || to)

  // Role text is debounced into the URL; selects and dates apply immediately.
  const [roleInput, setRoleInput] = useState(role)
  const roleTimer = useRef(null)
  useEffect(() => setRoleInput(role), [role])
  useEffect(() => {
    if (roleInput === role) return
    roleTimer.current = setTimeout(() => setFilter('role', roleInput), 400)
    return () => clearTimeout(roleTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleInput])

  const list = useAsync(
    () =>
      listInterviews(page, PAGE_SIZE, {
        status: status || undefined,
        role: role || undefined,
        // Date inputs are day-precision; make the range inclusive of the to-day.
        from: from ? `${from}T00:00:00` : undefined,
        to: to ? `${to}T23:59:59` : undefined,
      }),
    [page, status, role, from, to],
  )

  // The success note from creating an interview shows once.
  useEffect(() => {
    if (location.state?.created) {
      setCreatedNote(location.state.created)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Functional updates: the debounced role timer may fire after the URL has
  // moved on (e.g. Clear clicked mid-debounce), so always read the latest.
  function setFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page') // any filter change restarts the list
      return next
    })
  }

  function clearFilters() {
    setRoleInput('')
    setSearchParams({})
  }

  function goToPage(next) {
    const params = new URLSearchParams(searchParams)
    if (next === 1) params.delete('page')
    else params.set('page', String(next))
    setSearchParams(params)
  }

  // Retake: fresh PENDING attempt from this row's saved configuration; the
  // old attempt is never touched. The server's dedupe window folds rapid
  // double-clicks into one new attempt.
  const [retakingId, setRetakingId] = useState(null)
  const [retakeError, setRetakeError] = useState(null)
  async function handleRetake(interview) {
    setRetakeError(null)
    setRetakingId(interview.id)
    try {
      const res = await retakeInterview(interview.id)
      navigate(`/interviews/${res.interview.id}`)
    } catch (err) {
      setRetakeError(err.message || 'Could not start the retake. Try again.')
      setRetakingId(null)
    }
  }

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="History filters">
      <select
        aria-label="Filter by status"
        value={status}
        onChange={(e) => setFilter('status', e.target.value)}
        className={controlClass}
      >
        <option value="">All statuses</option>
        <option value="PENDING">Draft</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="COMPLETED">Completed</option>
      </select>
      <input
        type="search"
        aria-label="Filter by role"
        placeholder="Role contains…"
        value={roleInput}
        onChange={(e) => setRoleInput(e.target.value)}
        className={`${controlClass} w-40 placeholder:text-muted/70`}
      />
      <input
        type="date"
        aria-label="Created from"
        value={from}
        max={to || undefined}
        onChange={(e) => setFilter('from', e.target.value)}
        className={`${controlClass} text-muted`}
      />
      <span aria-hidden="true" className="text-xs text-muted">
        to
      </span>
      <input
        type="date"
        aria-label="Created to"
        value={to}
        min={from || undefined}
        onChange={(e) => setFilter('to', e.target.value)}
        className={`${controlClass} text-muted`}
      />
      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="h-8 rounded-[6px] px-2.5 text-sm font-medium text-ink underline underline-offset-2 hover:opacity-80"
        >
          Clear
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium text-ink">History</h1>
            <p className="mt-1.5 text-sm text-muted">
              {list.data ? (
                hasFilters ? (
                  list.data.total === 1 ? (
                    '1 interview matches'
                  ) : (
                    `${list.data.total} interviews match`
                  )
                ) : list.data.total === 1 ? (
                  '1 interview'
                ) : (
                  `${list.data.total} interviews`
                )
              ) : (
                'Every interview you have set up.'
              )}
            </p>
          </div>
          {filterControls}
        </div>
      </div>

      {createdNote && (
        <p role="status" className="rounded-[8px] border border-line bg-surface px-4 py-3 text-sm text-ink">
          “{createdNote}” saved as a draft. Answering opens once the AI interviewer is connected.
        </p>
      )}

      {retakeError && (
        <p role="alert" className="rounded-[8px] border border-line bg-surface px-4 py-3 text-sm text-negative">
          {retakeError}
        </p>
      )}

      <section className="rounded-[8px] border border-line bg-surface">
        <div className="px-5 pb-1 pt-4">
          {list.loading ? (
            <RowsSkeleton rows={5} />
          ) : list.error ? (
            <BlockError message={list.error} onRetry={list.refetch} />
          ) : list.data.interviews.length === 0 ? (
            <div className="pb-3">
              {hasFilters ? (
                <EmptyState
                  message="No interviews match these filters."
                  action={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex h-9 items-center rounded-[6px] border border-control bg-surface px-4 text-sm font-medium text-ink hover:border-muted"
                    >
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  message="No interviews yet. Set one up and it will be listed here."
                  action={
                    <Link
                      to="/interviews/new"
                      className="inline-flex h-9 items-center rounded-[6px] bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
                    >
                      New interview
                    </Link>
                  }
                />
              )}
            </div>
          ) : (
            <div className="divide-y divide-rule">
              {list.data.interviews.map((interview) => (
                <InterviewRow
                  key={interview.id}
                  interview={interview}
                  onRetake={handleRetake}
                  retaking={retakingId === interview.id}
                />
              ))}
            </div>
          )}
        </div>
        {list.data && !list.loading && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            pageSize={PAGE_SIZE}
            onPage={goToPage}
          />
        )}
      </section>
    </div>
  )
}
