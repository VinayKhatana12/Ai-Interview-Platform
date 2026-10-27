import { Link, useParams, useSearchParams } from 'react-router-dom'
import { compareInterviews, listInterviews } from '../api/interviews.js'
import { useAsync } from '../hooks/useAsync.js'
import { RowsSkeleton } from '../components/Skeletons.jsx'
import { EmptyState, BlockError } from '../components/States.jsx'
import { formatDateShort, scoreText, EXPERIENCE_LABELS } from '../utils/format.js'

// Compare two completed attempts. The server derives comparability from the
// persisted configurations; this screen states it up front and keeps score
// deltas grey unless the attempts are truly comparable — a number that looks
// like improvement across different roles or difficulties would be a lie.

const TYPE_LABELS = { TECHNICAL: 'Technical', BEHAVIORAL: 'Behavioral' }
const DIFF_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' }

function metaLine(attempt) {
  return [
    TYPE_LABELS[attempt.interviewType] ?? attempt.interviewType,
    DIFF_LABELS[attempt.difficulty] ?? attempt.difficulty,
    EXPERIENCE_LABELS[attempt.experienceLevel] ?? attempt.experienceLevel,
  ].join(' · ')
}

function signed(n) {
  if (typeof n !== 'number') return '—'
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

// Attempt picker: choose the second attempt from the other completed runs.
function ComparePicker({ baseId }) {
  const list = useAsync(() => listInterviews(1, 20, { status: 'COMPLETED' }), [baseId])

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-sm text-muted">
          <Link to={`/interviews/${baseId}/report`} className="underline underline-offset-2 hover:opacity-80">
            Back to report
          </Link>
        </p>
        <h1 className="text-2xl font-medium text-ink">Compare attempts</h1>
        <p className="text-sm text-muted">Pick the completed interview to compare this one against.</p>
      </header>

      <section className="rounded-[8px] border border-line bg-surface">
        <div className="px-5 pb-2 pt-4">
          {list.loading ? (
            <RowsSkeleton rows={4} />
          ) : list.error ? (
            <BlockError message={list.error} onRetry={list.refetch} />
          ) : (
            (() => {
              const others = list.data.interviews.filter((iv) => iv.id !== baseId)
              if (others.length === 0) {
                return (
                  <div className="pb-3">
                    <EmptyState message="You need one more completed interview to compare against. Finish another attempt and come back." />
                  </div>
                )
              }
              return (
                <ul className="divide-y divide-rule">
                  {others.map((iv) => (
                    <li key={iv.id}>
                      <Link
                        to={`?with=${iv.id}`}
                        className="flex items-center justify-between gap-4 py-3 hover:opacity-80"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{iv.roleTitle}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            Completed {formatDateShort(iv.completedAt)}
                          </span>
                        </span>
                        <span className="flex-none text-sm text-ink tnum">{scoreText(iv.score)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            })()
          )}
        </div>
      </section>
    </div>
  )
}

function AttemptCard({ attempt, latest }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-medium text-ink">{attempt.roleTitle}</h2>
        {latest && <span className="flex-none text-xs text-muted">latest</span>}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{metaLine(attempt)}</p>
      <p className="mt-4 text-[30px] font-medium leading-9 text-ink tnum">{scoreText(attempt.avgScore)}</p>
      <p className="mt-1 text-xs text-muted tnum">
        {attempt.evaluatedCount} of {attempt.questionCount} answers evaluated ·{' '}
        {formatDateShort(attempt.completedAt)}
      </p>
    </div>
  )
}

function CompareView({ baseId, otherId }) {
  const comparison = useAsync(() => compareInterviews(baseId, otherId), [baseId, otherId])

  if (comparison.loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="skeleton-bar h-7 w-48" />
          <div className="skeleton-bar h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="skeleton-bar h-40 rounded-[8px]" />
          <div className="skeleton-bar h-40 rounded-[8px]" />
        </div>
      </div>
    )
  }
  if (!comparison.data) {
    return (
      <div className="pt-8">
        <BlockError
          message={comparison.error || 'Could not load the comparison.'}
          onRetry={comparison.refetch}
        />
      </div>
    )
  }

  const { a, b, comparability } = comparison.data

  // Chronological order: deltas are always phrased newer vs older, so
  // "improvement" means what it says regardless of which link was followed.
  const [first, second] =
    new Date(a.completedAt) <= new Date(b.completedAt) ? [a, b] : [b, a]
  const overallDelta =
    first.avgScore != null && second.avgScore != null
      ? Math.round((second.avgScore - first.avgScore) * 10) / 10
      : null
  const deltaClass = !comparability.comparable
    ? 'text-muted'
    : overallDelta > 0
      ? 'text-positive'
      : overallDelta < 0
        ? 'text-negative'
        : 'text-muted'

  const firstTopics = new Map(first.topicScores.map((t) => [t.topic, t.avgScore]))
  const secondTopics = new Map(second.topicScores.map((t) => [t.topic, t.avgScore]))
  const sharedTopics = [...firstTopics.keys()].filter((t) => secondTopics.has(t))

  const differences = []
  if (!comparability.sameRole)
    differences.push(`role differs (${first.roleTitle} vs ${second.roleTitle})`)
  if (!comparability.sameType)
    differences.push(
      `interview type differs (${TYPE_LABELS[first.interviewType] ?? first.interviewType} vs ${
        TYPE_LABELS[second.interviewType] ?? second.interviewType
      })`,
    )
  if (!comparability.sameDifficulty)
    differences.push(
      `difficulty differs (${DIFF_LABELS[first.difficulty] ?? first.difficulty} vs ${
        DIFF_LABELS[second.difficulty] ?? second.difficulty
      })`,
    )
  if (comparability.sharedTopics.length === 0) differences.push('no shared topics in the setup')

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-sm text-muted">
          <Link to={`/interviews/${baseId}/report`} className="underline underline-offset-2 hover:opacity-80">
            Back to report
          </Link>
        </p>
        <h1 className="text-2xl font-medium text-ink">Compare attempts</h1>
        <p className="text-sm text-muted">
          {first.roleTitle} ({formatDateShort(first.completedAt)}) against {second.roleTitle} (
          {formatDateShort(second.completedAt)}).
        </p>
      </header>

      <div
        role={comparability.comparable ? undefined : 'alert'}
        className={`rounded-[8px] border border-line px-4 py-3 text-sm ${
          comparability.comparable ? 'bg-surface text-ink' : 'bg-[#fffbeb] text-[#92400e]'
        }`}
      >
        {comparability.comparable ? (
          <>
            Same role, interview type and difficulty with shared topics — the score changes below are
            directly comparable.
          </>
        ) : (
          <>
            Not directly comparable: {differences.join(', ')}. Treat the score changes below as
            indicative only.
          </>
        )}
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <AttemptCard attempt={first} />
        <AttemptCard attempt={second} latest />
      </div>

      <p className="text-sm text-ink">
        {overallDelta == null ? (
          'Not enough evaluated answers on one attempt for an overall score.'
        ) : (
          <>
            Newer attempt vs older:{' '}
            <span className={`font-medium tnum ${deltaClass}`}>{signed(overallDelta)}</span>
          </>
        )}
      </p>

      <section className="rounded-[8px] border border-line bg-surface">
        <div className="px-5 py-4">
          <h2 className="text-base font-medium text-ink">Topic by topic</h2>
          <p className="mt-1 text-xs text-muted">
            Average score per topic from evaluated answers on each attempt.
          </p>
        </div>
        <div className="px-5 pb-5">
          {sharedTopics.length === 0 ? (
            <p className="pb-2 text-sm text-muted">
              No topic has evaluated answers on both attempts, so there is nothing to line up
              topic-for-topic.
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Average score per topic on both attempts</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="pb-2 font-normal">Topic</th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    {formatDateShort(first.completedAt)}
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    {formatDateShort(second.completedAt)}
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {sharedTopics.map((topic) => {
                  const v1 = firstTopics.get(topic)
                  const v2 = secondTopics.get(topic)
                  const change =
                    v1 != null && v2 != null
                      ? Math.round((v2 - v1) * 10) / 10
                      : null
                  return (
                    <tr key={topic}>
                      <td className="py-2.5 text-ink">{topic}</td>
                      <td className="py-2.5 text-right text-ink tnum">{scoreText(v1)}</td>
                      <td className="py-2.5 text-right text-ink tnum">{scoreText(v2)}</td>
                      <td className={`py-2.5 text-right tnum ${deltaClass}`}>{signed(change)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {(comparability.differingTopics.onlyInFirst.length > 0 ||
            comparability.differingTopics.onlyInSecond.length > 0) && (
            <div className="mt-4 space-y-1 text-xs text-muted">
              {comparability.differingTopics.onlyInFirst.length > 0 && (
                <p>Only in the {first.roleTitle} setup: {comparability.differingTopics.onlyInFirst.join(' · ')}</p>
              )}
              {comparability.differingTopics.onlyInSecond.length > 0 && (
                <p>Only in the {second.roleTitle} setup: {comparability.differingTopics.onlyInSecond.join(' · ')}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default function Compare() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const otherId = searchParams.get('with')

  return otherId ? <CompareView baseId={id} otherId={otherId} /> : <ComparePicker baseId={id} />
}
