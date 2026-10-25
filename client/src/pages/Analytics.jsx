import { Link } from 'react-router-dom'
import { getInterviewAnalytics } from '../api/interviews.js'
import { useAsync } from '../hooks/useAsync.js'
import { KpiSkeleton, RowsSkeleton } from '../components/Skeletons.jsx'
import { EmptyState, BlockError } from '../components/States.jsx'
import { ScoreTrendChart } from '../components/ScoreTrendChart.jsx'

// Personal analytics over persisted evaluations. Honest by construction:
// the skill axes are the ones the data actually has — interview overalls on
// the documented scale, the question's topic, and the evaluator's
// correctness verdict. No invented criteria, no projected points.

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Line chart of all scored interviews; hollow markers mark partial results
// (interviews where some answers were not evaluated). A text list beside the
// chart is the non-visual alternative.
function TrendChart({ points }) {
  const W = 660
  const H = 200
  const PAD = { top: 12, right: 48, bottom: 26, left: 40 }
  const yMax = Math.max(40, Math.ceil((Math.max(...points.map((p) => p.score)) * 1.05) / 20) * 20)
  const step = yMax / 4
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xAt = (i) => PAD.left + (plotW * i) / (points.length - 1)
  const yAt = (s) => PAD.top + plotH - (plotH * s) / yMax
  const line = points.map((p, i) => `${xAt(i)},${yAt(p.score)}`).join(' ')
  const labelEvery = Math.max(1, Math.ceil((points.length - 1) / 4))

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" focusable="false"
        aria-label={`Line chart of ${points.length} interview scores from ${fmtDate(points[0].completedAt)} to ${fmtDate(points[points.length - 1].completedAt)}: ${points.map((p) => p.score).join(', ')}. Scale 0 to ${yMax}. Hollow points are partial results.`}
      >
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t * step)} y2={yAt(t * step)} stroke="#e5e5e5" strokeWidth="1" />
            <text x={PAD.left - 6} y={yAt(t * step) + 4} textAnchor="end" fontSize="12" fill="#6b6b6b" className="tnum">
              {Math.round(t * step)}
            </text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="#1d5fbf" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.score)}
              r="4"
              fill={p.partial ? '#ffffff' : '#1d5fbf'}
              stroke="#1d5fbf"
              strokeWidth="2"
            />
          </g>
        ))}
        <text x={xAt(points.length - 1) + 8} y={yAt(points[points.length - 1].score) + 4} fontSize="12" fill="#0a0a0a" className="tnum">
          {points[points.length - 1].score.toFixed(1)}
        </text>
        {points
          .map((p, i) => ({ i, at: i % labelEvery === 0 || i === points.length - 1, p }))
          .filter((l) => l.at)
          .map(({ i, p }) => (
            <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b6b6b">
              {fmtDate(p.completedAt)}
            </text>
          ))}
      </svg>
      <ul className="space-y-2.5 self-start text-sm" aria-label="Interview scores as a list">
        {points.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
            <span className="min-w-0 truncate text-ink">
              {p.roleTitle}
              {p.partial && <span className="ml-2 text-xs text-muted">(partial)</span>}
            </span>
            <span className="flex-none text-ink tnum">{p.score.toFixed(1)}</span>
            <span className="w-16 flex-none text-right text-xs text-muted">{fmtDate(p.completedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Skill-wise performance as a bar list: one hue, value after each bar,
// verdict counts beside. The comparison is only drawn between topics that
// have evaluated answers.
function TopicBars({ topics, strongest, weakest }) {
  return (
    <ul className="space-y-4" aria-label="Average score by topic">
      {topics.map((t) => (
        <li key={t.topic}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-ink">
              {t.topic}
              {t.topic === strongest && <span className="ml-2 text-xs text-muted">strongest</span>}
              {t.topic === weakest && <span className="ml-2 text-xs text-muted">weakest</span>}
            </p>
            <p className="text-sm text-ink tnum">{t.avgScore.toFixed(1)}</p>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-rule" role="img" aria-label={`${t.topic}: average ${t.avgScore} over ${t.answered} evaluated answers`}>
            <div
              className="h-full rounded-full bg-[#1d5fbf]"
              style={{ width: `${Math.max(1, t.avgScore)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted tnum">
            {t.answered} evaluated · {t.correct} correct · {t.partial} partial · {t.incorrect} incorrect
          </p>
        </li>
      ))}
    </ul>
  )
}

export default function Analytics() {
  const analytics = useAsync(getInterviewAnalytics)

  if (analytics.loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="skeleton-bar h-7 w-40" />
          <div className="skeleton-bar h-4 w-64 max-w-full" />
        </div>
        <KpiSkeleton />
        <div className="rounded-[8px] border border-line bg-surface">
          <div className="p-5"><div className="skeleton-bar h-4 w-40" /></div>
          <div className="px-5 pb-5"><RowsSkeleton rows={4} /></div>
        </div>
      </div>
    )
  }

  if (!analytics.data) {
    return (
      <div className="pt-8">
        <BlockError message={analytics.error || 'Could not load analytics.'} onRetry={analytics.refetch} />
      </div>
    )
  }

  const a = analytics.data
  const enoughForTrend = a.trend.length >= 2

  // Data-grounded summary: every claim maps to a number on this page.
  function summary() {
    if (a.scoredCount === 0) return null
    const parts = []
    parts.push(
      a.scoredCount === 1
        ? 'One scored interview so far'
        : `${a.scoredCount} scored interviews`,
    )
    parts.push(`averaging ${a.avgScore.toFixed(1)}, best ${a.bestScore.toFixed(1)}`)
    if (a.trend.length >= 2) {
      const first = a.trend[0].score
      const last = a.trend[a.trend.length - 1].score
      const delta = Math.round((last - first) * 10) / 10
      if (delta > 0) parts.push(`up ${delta} since your first scored run`)
      else if (delta < 0) parts.push(`down ${Math.abs(delta)} since your first scored run`)
      else parts.push('level with your first scored run')
    }
    if (a.strongest) parts.push(`strongest on ${a.strongest}`)
    if (a.weakest && a.weakest !== a.strongest) parts.push(`weakest on ${a.weakest}`)
    return parts.join(', ') + '.'
  }

  const empty = a.scoredCount === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Analytics</h1>
        <p className="mt-1.5 text-sm text-muted">
          Performance across your completed interviews, from persisted evaluations.
        </p>
      </div>

      {empty ? (
        <EmptyState
          message="No evaluated interviews yet. Finish an interview and request feedback — your analytics will build from the results."
          action={
            <Link
              to="/interviews/new"
              className="inline-flex h-9 items-center rounded-[6px] bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            >
              New interview
            </Link>
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule md:grid-cols-4">
            {[
              { label: 'Completed interviews', value: `${a.completedCount}` },
              { label: 'Average score', value: a.avgScore != null ? a.avgScore.toFixed(1) : '—', muted: a.avgScore == null },
              { label: 'Best score', value: a.bestScore != null ? a.bestScore.toFixed(1) : '—', muted: a.bestScore == null },
              { label: 'Answers evaluated', value: `${a.verdicts.CORRECT + a.verdicts.PARTIALLY_CORRECT + a.verdicts.INCORRECT}` },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-1 bg-surface p-5">
                <dt className="text-xs text-muted">{cell.label}</dt>
                <dd className={`text-[30px] font-medium leading-9 tnum ${cell.muted ? 'text-muted/50' : 'text-ink'}`}>
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-ink">{summary()}</p>

          <section className="rounded-[8px] border border-line bg-surface">
            <div className="px-5 py-4">
              <h2 className="text-base font-medium text-ink">Score trend</h2>
              <p className="mt-1 text-xs text-muted">
                {enoughForTrend
                  ? 'Every scored interview, oldest to newest. Hollow points mark partial results (some answers not evaluated).'
                  : 'One scored interview is not a trend yet — finish more interviews to see movement here.'}
              </p>
            </div>
            <div className="px-4 pb-5">
              {enoughForTrend ? (
                <TrendChart points={a.trend} />
              ) : (
                <ul className="space-y-2.5 px-1 text-sm" aria-label="Scored interviews">
                  {a.trend.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
                      <span className="min-w-0 truncate text-ink">
                        {p.roleTitle}
                        {p.partial && <span className="ml-2 text-xs text-muted">(partial)</span>}
                      </span>
                      <span className="flex-none text-ink tnum">{p.score.toFixed(1)}</span>
                      <span className="w-16 flex-none text-right text-xs text-muted">{fmtDate(p.completedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-[8px] border border-line bg-surface">
            <div className="px-5 py-4">
              <h2 className="text-base font-medium text-ink">Skill-wise performance</h2>
              <p className="mt-1 text-xs text-muted">
                Average score by interview topic, with the evaluator's correctness verdicts.
                Topics with fewer answers are less reliable comparisons.
              </p>
            </div>
            <div className="px-5 pb-5">
              <TopicBars topics={a.topics} strongest={a.strongest} weakest={a.weakest} />
            </div>
          </section>

          {a.strongest && a.weakest && a.strongest !== a.weakest && (
            <p className="text-sm text-muted">
              Grounded next step: your reports already flag {a.weakest} questions — the practice
              suggestions on each report come from the same scores.
            </p>
          )}
        </>
      )}
    </div>
  )
}
