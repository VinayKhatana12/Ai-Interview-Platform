import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { listInterviews } from '../api/interviews.js'
import { useAsync } from '../hooks/useAsync.js'
import { RowsSkeleton } from '../components/Skeletons.jsx'
import { EmptyState, BlockError } from '../components/States.jsx'
import { InterviewRow } from '../components/InterviewRow.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { Link } from 'react-router-dom'

const PAGE_SIZE = 10

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const location = useLocation()
  const [createdNote, setCreatedNote] = useState(location.state?.created ?? null)

  const list = useAsync(() => listInterviews(page, PAGE_SIZE), [page])

  // The success note from creating an interview shows once.
  useEffect(() => {
    if (location.state?.created) {
      setCreatedNote(location.state.created)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  function goToPage(next) {
    setSearchParams(next === 1 ? {} : { page: String(next) })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">History</h1>
        <p className="mt-1.5 text-sm text-muted">
          {list.data ? (
            list.data.total === 1 ? (
              '1 interview'
            ) : (
              `${list.data.total} interviews`
            )
          ) : (
            'Every interview you have set up.'
          )}
        </p>
      </div>

      {createdNote && (
        <p role="status" className="rounded-[8px] border border-line bg-surface px-4 py-3 text-sm text-ink">
          “{createdNote}” saved as a draft. Answering opens once the AI interviewer is connected.
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
            </div>
          ) : (
            <div className="divide-y divide-rule">
              {list.data.interviews.map((interview) => (
                <InterviewRow key={interview.id} interview={interview} />
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
