import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { getInterviewStats, listInterviews } from '../api/interviews.js'
import { useAsync } from '../hooks/useAsync.js'
import { KpiSkeleton, RowsSkeleton } from '../components/Skeletons.jsx'
import { EmptyState, BlockError } from '../components/States.jsx'
import { InterviewRow } from '../components/InterviewRow.jsx'
import { ScoreTrendChart } from '../components/ScoreTrendChart.jsx'
import { greeting } from '../utils/format.js'

// The dashboard answers one question first: how is my practice going, and
// what do I do next? Numbers are real; with no interviews the zeros are
// honest and the empty state carries the screen's action.
function KpiStrip({ stats }) {
  const cells = [
    { label: 'Completed interviews', value: stats?.completed ?? 0 },
    {
      label: 'Average score',
      value: stats?.avgScore != null ? stats.avgScore.toFixed(1) : '—',
      muted: stats?.avgScore == null,
    },
    {
      label: 'Best score',
      value: stats?.bestScore != null ? stats.bestScore.toFixed(1) : '—',
      muted: stats?.bestScore == null,
    },
    { label: 'Questions answered', value: stats?.answeredTotal ?? 0 },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule md:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1 bg-surface p-5">
          <dt className="text-xs text-muted">{cell.label}</dt>
          <dd className={`text-[30px] font-medium leading-9 tnum ${cell.muted ? 'text-muted/50' : 'text-ink'}`}>
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const stats = useAsync(getInterviewStats)
  const recent = useAsync(() => listInterviews(1, 5), [])

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  const trendPoints = stats.data?.recentScores ?? []
  const showTrend = trendPoints.length >= 2

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted">
            {today} · {greeting()}, {firstName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/history"
            className="inline-flex h-9 items-center rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised"
          >
            View history
          </Link>
          <Link
            to="/interviews/new"
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            New interview
          </Link>
        </div>
      </div>

      {stats.loading ? (
        <KpiSkeleton />
      ) : stats.error ? (
        <BlockError message={stats.error} onRetry={stats.refetch} />
      ) : (
        <KpiStrip stats={stats.data} />
      )}

      {!stats.loading && !stats.error && showTrend && (
        <section className="rounded-[8px] border border-line bg-surface">
          <div className="px-5 py-4">
            <h2 className="text-base font-medium text-ink">Score trend</h2>
            <p className="mt-1 text-xs text-muted">
              Overall score of your last {trendPoints.length} scored interviews, oldest to newest.
            </p>
          </div>
          <div className="px-4 pb-4">
            <ScoreTrendChart points={trendPoints} />
          </div>
        </section>
      )}

      <section className="rounded-[8px] border border-line bg-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-medium text-ink">Recent interviews</h2>
          {recent.data && recent.data.total > 5 && (
            <Link to="/history" className="text-sm text-ink underline underline-offset-2 hover:opacity-80">
              View all
            </Link>
          )}
        </div>
        <div className="px-5 pb-2">
          {recent.loading ? (
            <RowsSkeleton rows={3} />
          ) : recent.error ? (
            <BlockError message={recent.error} onRetry={recent.refetch} />
          ) : recent.data.interviews.length === 0 ? (
            <div className="pb-3">
              <EmptyState
                message="No interviews yet. Your first practice interview will appear here."
                action={
                  <Link
                    to="/interviews/new"
                    className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
                  >
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    New interview
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-rule">
              {recent.data.interviews.map((interview) => (
                <InterviewRow key={interview.id} interview={interview} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
