import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { getInterviewResults, evaluateInterview } from '../api/interviews.js'
import { StatusPill } from '../components/StatusPill.jsx'
import { BlockError } from '../components/States.jsx'
import { RowsSkeleton } from '../components/Skeletons.jsx'

// The detailed interview report: a pure read of persisted data (the server
// never re-runs evaluation here). Overall score = the documented method —
// the mean of this interview's evaluated answer scores, 1 decimal — labeled
// with how many answers it rests on, and marked partial when some answers
// are not yet evaluated. Missing scores are shown as dashes, never zeros.

const CORRECTNESS_STYLES = {
  CORRECT: 'bg-[#dcfae5] text-[#04250e]',
  PARTIALLY_CORRECT: 'bg-[#fffbeb] text-[#92400e]',
  INCORRECT: 'bg-[#ffedea] text-[#831c1e]',
}

const CORRECTNESS_LABELS = {
  CORRECT: 'Correct',
  PARTIALLY_CORRECT: 'Partially correct',
  INCORRECT: 'Incorrect',
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function QuestionCard({ item, failed, canEvaluate }) {
  const e = item.evaluation
  const scoreLabel = e ? e.score.toFixed(0) : '—'
  return (
    <details open className="break-inside-avoid rounded-[8px] border border-line bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3">
        <span className="text-sm font-medium text-ink">
          Question {item.question.order} · {item.question.topic}
        </span>
        <span className="flex items-center gap-2.5">
          {failed && (
            <span className="inline-flex h-6 items-center rounded-full bg-[#ffedea] px-2.5 text-xs font-medium text-[#831c1e]">
              Feedback failed
            </span>
          )}
          {e && (
            <>
              <span className="text-sm text-ink tnum">
                {scoreLabel} <span className="text-xs text-muted">/ 100</span>
              </span>
              <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${CORRECTNESS_STYLES[e.correctness] ?? CORRECTNESS_STYLES.PARTIALLY_CORRECT}`}>
                {CORRECTNESS_LABELS[e.correctness] ?? e.correctness}
              </span>
            </>
          )}
          {!e && item.answer && !failed && (
            <span className="inline-flex h-6 items-center rounded-full bg-raised px-2.5 text-xs font-medium text-[#3d3d3d]">
              {canEvaluate ? 'Awaiting feedback' : 'Not evaluated'}
            </span>
          )}
          {!item.answer && (
            <span className="inline-flex h-6 items-center rounded-full bg-raised px-2.5 text-xs font-medium text-[#3d3d3d]">
              Not answered
            </span>
          )}
        </span>
      </summary>

      <div className="space-y-4 px-5 py-5">
        <p className="text-base font-medium leading-relaxed text-ink">{item.question.text}</p>

        <div>
          <p className="text-xs font-medium text-muted">Your answer</p>
          {item.answer ? (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {item.answer.responseText}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">No answer was submitted for this question.</p>
          )}
        </div>

        {e && (
          <div className="space-y-3 border-t border-rule pt-4">
            <p className="text-sm leading-relaxed text-ink">{e.feedback}</p>
            {(e.strengths.length > 0 || e.improvements.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {e.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted">Strengths</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-ink">
                      {e.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {e.improvements.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted">Improvements</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-ink">
                      {e.improvements.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted underline underline-offset-2 hover:text-ink">
                Model answer
              </summary>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink">{e.modelAnswer}</p>
            </details>
          </div>
        )}

        {failed && !e && (
          <p role="status" className="text-sm text-[#92400e]">
            Feedback could not be generated for this answer. Use “Retry feedback” above.
          </p>
        )}
      </div>
    </details>
  )
}

export default function Report() {
  const { id } = useParams()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evaluating, setEvaluating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setResults(await getInterviewResults(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleEvaluate() {
    setEvaluating(true)
    setError('')
    try {
      setResults(await evaluateInterview(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setEvaluating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="space-y-2">
          <div className="skeleton-bar h-7 w-56" />
          <div className="skeleton-bar h-4 w-72 max-w-full" />
        </div>
        <RowsSkeleton rows={4} />
      </div>
    )
  }

  if (!results) {
    return (
      <div className="mx-auto max-w-[720px] pt-8">
        <BlockError message={error || 'Could not load this report.'} onRetry={load} />
        <Link to="/history" className="mt-4 inline-block text-sm text-muted underline underline-offset-2 hover:text-ink">
          Back to history
        </Link>
      </div>
    )
  }

  const { interview, items } = results
  const completed = interview.status === 'COMPLETED'
  const evaluatedAll = results.evaluatedCount >= results.totalAnswered && results.totalAnswered > 0
  const partialScore = results.evaluatedCount > 0 && results.evaluatedCount < results.totalAnswered
  const hasFailures = results.failures?.length > 0
  const failedOrders = new Set((results.failures ?? []).map((f) => f.questionOrder))
  const minutes =
    interview.startedAt && interview.completedAt
      ? Math.max(1, Math.round((Date.parse(interview.completedAt) - Date.parse(interview.startedAt)) / 60000))
      : null
  const dateLabel = fmtDate(interview.completedAt) ?? fmtDate(interview.startedAt)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink">{interview.roleTitle}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusPill status={interview.status} />
            {dateLabel && <span>· {dateLabel}</span>}
            {completed && minutes != null && <span className="tnum">· Took {minutes} min</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised print:hidden"
        >
          <Printer size={16} strokeWidth={2} aria-hidden="true" />
          Print
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule sm:grid-cols-4">
        <div className="flex flex-col gap-1 bg-surface p-4">
          <dt className="text-xs text-muted">
            {completed ? 'Overall score' : 'Score so far'}
          </dt>
          <dd className={`text-xl font-medium tnum ${results.avgScore != null ? 'text-ink' : 'text-muted/50'}`}>
            {results.avgScore != null ? results.avgScore.toFixed(1) : '—'}
          </dd>
          <dd className="text-xs text-muted">
            {results.evaluatedCount > 0
              ? `Mean of ${results.evaluatedCount} of ${results.totalAnswered} evaluated answers${partialScore ? ' · partial' : ''}`
              : 'No evaluated answers yet'}
          </dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface p-4">
          <dt className="text-xs text-muted">Answered</dt>
          <dd className="text-xl font-medium text-ink tnum">{results.totalAnswered}</dd>
          <dd className="text-xs text-muted">of {interview.questionCount} questions</dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface p-4">
          <dt className="text-xs text-muted">Evaluated</dt>
          <dd className="text-xl font-medium text-ink tnum">{results.evaluatedCount}</dd>
          <dd className="text-xs text-muted">
            {results.feedbackSource === 'ai' ? 'AI feedback' : 'Development fixture'}
          </dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface p-4">
          <dt className="text-xs text-muted">Difficulty</dt>
          <dd className="text-xl font-medium text-ink">{interview.difficulty[0] + interview.difficulty.slice(1).toLowerCase()}</dd>
          <dd className="text-xs text-muted">Text mode</dd>
        </div>
      </dl>

      <p className="text-xs text-muted">
        {results.feedbackSource === 'ai'
          ? 'AI-generated practice feedback. A signal for your preparation, not a guaranteed hiring outcome.'
          : 'Development feedback from the local fixture. Configure AI_API_KEY on the server for real AI feedback.'}
      </p>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      {hasFailures && (
        <p role="alert" className="text-sm text-negative">
          {results.failures.length} answer{results.failures.length > 1 ? 's' : ''} could not be
          evaluated. Retry keeps already-evaluated answers.
        </p>
      )}

      {completed && !evaluatedAll && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-line bg-surface px-5 py-4 print:hidden">
          <p className="text-sm text-muted">
            {evaluating
              ? 'Evaluating your answers…'
              : results.evaluatedCount === 0
                ? 'Feedback is generated once per answer, after the interview.'
                : 'Some answers are still awaiting feedback.'}
          </p>
          <button
            type="button"
            onClick={handleEvaluate}
            disabled={evaluating}
            className="h-10 flex-none rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {evaluating ? 'Evaluating…' : hasFailures ? 'Retry feedback' : 'Get feedback'}
          </button>
        </div>
      )}

      {results.practiceSuggestions === null ? null : results.practiceSuggestions.length > 0 ? (
        <section className="rounded-[8px] border border-line bg-surface">
          <div className="px-5 py-4">
            <h2 className="text-base font-medium text-ink">Practice next</h2>
            <p className="mt-1 text-xs text-muted">Derived from this interview's scores, weakest first.</p>
          </div>
          <ul className="divide-y divide-rule border-t border-rule">
            {results.practiceSuggestions.map((s) => (
              <li key={s.topic} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <span className="text-sm text-ink">{s.topic}</span>
                <span className="text-xs text-muted tnum">{s.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : completed && evaluatedAll ? (
        <p className="text-sm text-muted">No weak topics detected in this interview.</p>
      ) : null}

      <section aria-label="Question-by-question report" className="space-y-4">
        {items.map((item) => (
          <QuestionCard
            key={item.question.id}
            item={item}
            failed={failedOrders.has(item.question.order)}
            canEvaluate={completed}
          />
        ))}
      </section>

      <div className="flex gap-3 print:hidden">
        <Link
          to="/"
          className="h-9 rounded-[6px] bg-primary px-4 text-sm font-medium leading-9 text-white hover:opacity-90"
        >
          Back to dashboard
        </Link>
        <Link
          to="/history"
          className="h-9 rounded-[6px] border border-control bg-surface px-4 text-sm leading-9 text-ink hover:bg-raised"
        >
          History
        </Link>
      </div>
    </div>
  )
}
