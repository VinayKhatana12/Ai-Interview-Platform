import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import {
  getInterviewResults,
  evaluateInterview,
  generateInterviewFeedback,
  retakeInterview,
} from '../api/interviews.js'
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

// Improvement-plan priority pills: pale tints with dark text of the same
// hue, matching the app's status-pill conventions.
const PRIORITY_STYLES = {
  HIGH: 'bg-[#ffedea] text-[#831c1e]',
  MEDIUM: 'bg-[#fffbeb] text-[#92400e]',
  LOW: 'bg-raised text-[#3d3d3d]',
}

const CONFIDENCE_LABELS = {
  HIGH: 'Well evidenced',
  MEDIUM: 'Moderately evidenced',
  LOW: 'Limited evidence',
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
          {item.question.isFollowUp
            ? `Follow-up ${item.question.followUpIndex} of 2 on question ${item.question.order} · ${item.question.topic}`
            : `Question ${item.question.order} · ${item.question.topic}`}
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
  const [feedbackGenerating, setFeedbackGenerating] = useState(false)

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

  async function handleGenerateFeedback() {
    setFeedbackGenerating(true)
    setError('')
    try {
      const res = await generateInterviewFeedback(id)
      setResults((prev) => (prev ? { ...prev, feedback: res.feedback } : prev))
    } catch (err) {
      setError(err.message)
    } finally {
      setFeedbackGenerating(false)
    }
  }

  // Retake from this report: a fresh PENDING attempt with the same saved
  // configuration; this attempt is left untouched.
  const navigate = useNavigate()
  const [retaking, setRetaking] = useState(false)
  const [retakeError, setRetakeError] = useState('')
  async function handleRetake() {
    setRetakeError('')
    setRetaking(true)
    try {
      const res = await retakeInterview(id)
      navigate(`/interviews/${res.interview.id}`)
    } catch (err) {
      setRetakeError(err.message || 'Could not start the retake. Try again.')
      setRetaking(false)
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
      <div className="flex flex-wrap items-start justify-between gap-4 break-inside-avoid">
        <div>
          <h1 className="text-2xl font-medium text-ink">{interview.roleTitle}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusPill status={interview.status} />
            {dateLabel && <span>· {dateLabel}</span>}
            {completed && minutes != null && <span className="tnum">· Took {minutes} min</span>}
          </p>
        </div>
        <div className="print:hidden">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {completed && (
              <>
                <Link
                  to={`/interviews/${id}/compare`}
                  className="inline-flex h-9 items-center rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised"
                >
                  Compare attempts
                </Link>
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={retaking}
                  className="inline-flex h-9 items-center rounded-[6px] bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {retaking ? 'Retaking…' : 'Retake interview'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised"
            >
              <Printer size={16} strokeWidth={2} aria-hidden="true" />
              Print / Save as PDF
            </button>
          </div>
          {retakeError && (
            <p role="alert" className="mt-1.5 text-right text-xs text-negative">
              {retakeError}
            </p>
          )}
          <p className="mt-1.5 max-w-[260px] text-right text-xs text-muted">
            Opens your browser's print dialog. Choose "Save as PDF" there to export this report.
          </p>
        </div>
      </div>

      <dl className="break-inside-avoid grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule sm:grid-cols-4">
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

      {/* Whole-interview AI feedback + prioritized improvement plan */}
      {completed && evaluatedAll && !results.feedback && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-line bg-surface px-5 py-4 print:hidden">
          <p className="text-sm text-muted">
            {feedbackGenerating
              ? 'Preparing your personalized feedback…'
              : 'Your per-answer feedback is ready. Generate the overall report for a summary and a prioritized improvement plan.'}
          </p>
          <button
            type="button"
            onClick={handleGenerateFeedback}
            disabled={feedbackGenerating}
            className="h-10 flex-none rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {feedbackGenerating ? 'Preparing…' : 'Generate overall feedback'}
          </button>
        </div>
      )}

      {results.feedback && (
        <>
          <section className="rounded-[8px] border border-line bg-surface" aria-label="Overall feedback">
            <div className="px-5 py-4">
              <h2 className="text-base font-medium text-ink">Overall feedback</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{results.feedback.summary}</p>
            </div>
            <div className="grid gap-5 border-t border-rule px-5 py-5 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-muted">Key strengths</h3>
                <ul className="mt-2 space-y-2.5">
                  {results.feedback.strengths.map((s, i) => (
                    <li key={i} className="text-sm">
                      <p className="text-ink">{s.point}</p>
                      <p className="mt-0.5 text-xs text-muted">Evidence: {s.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted">Areas to improve</h3>
                <ul className="mt-2 space-y-2.5">
                  {results.feedback.improvements.map((s, i) => (
                    <li key={i} className="text-sm">
                      <p className="text-ink">{s.point}</p>
                      <p className="mt-0.5 text-xs text-muted">Evidence: {s.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-line bg-surface" aria-label="Skill assessment">
            <div className="px-5 py-4">
              <h2 className="text-base font-medium text-ink">Skill assessment</h2>
              <p className="mt-1 text-xs text-muted">
                Qualitative notes per topic, based only on the answers you gave. Confidence reflects how much evidence the topic had.
              </p>
            </div>
            <ul className="divide-y divide-rule border-t border-rule">
              {results.feedback.skillNotes.map((n) => (
                <li key={n.topic} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{n.topic}</p>
                    <span className="inline-flex h-6 items-center rounded-full bg-raised px-2.5 text-xs font-medium text-[#3d3d3d]">
                      {CONFIDENCE_LABELS[n.confidence] ?? n.confidence}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink">{n.assessment}</p>
                  <p className="mt-1 text-xs text-muted">Evidence: {n.evidence}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[8px] border border-line bg-surface" aria-label="Improvement plan">
            <div className="px-5 py-4">
              <h2 className="text-base font-medium text-ink">Improvement plan</h2>
              <p className="mt-1 text-xs text-muted">
                Prioritized from your weakest results, in the order we suggest working through them.
              </p>
            </div>
            <ol className="divide-y divide-rule border-t border-rule">
              {results.feedback.plan.map((p) => (
                <li key={p.sequence} className="break-inside-avoid px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {p.sequence}. {p.topic}
                    </p>
                    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${PRIORITY_STYLES[p.priority] ?? PRIORITY_STYLES.MEDIUM}`}>
                      {p.priority[0] + p.priority.slice(1).toLowerCase()} priority
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{p.why}</p>
                  <dl className="mt-2.5 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="flex-none text-xs font-medium text-muted">Exercise</dt>
                      <dd className="text-ink">{p.exercise}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="flex-none text-xs font-medium text-muted">Done when</dt>
                      <dd className="text-ink">{p.doneWhen}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </section>
        </>
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
          to="/dashboard"
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
