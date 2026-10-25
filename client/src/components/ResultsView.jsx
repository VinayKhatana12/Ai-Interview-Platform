import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getInterviewResults, evaluateInterview } from '../api/interviews.js'
import { StatusPill } from './StatusPill.jsx'
import { BlockError } from './States.jsx'
import { RowsSkeleton } from './Skeletons.jsx'

// Results: per-question AI feedback for a completed interview. The feedback
// is always labeled, either "AI-generated practice feedback" (or, without a
// configured provider, development-fixture feedback), never as a verdict.

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

function FeedbackCard({ item }) {
  const e = item.evaluation
  return (
    <article className="rounded-[8px] border border-line bg-surface">
      <div className="border-b border-rule px-5 py-2.5">
        <p className="text-xs text-muted">
          Question {item.question.order} · {item.question.topic}
        </p>
      </div>
      <div className="space-y-4 px-5 py-5">
        <p className="text-base font-medium leading-relaxed text-ink">{item.question.text}</p>

        <div>
          <p className="text-xs font-medium text-muted">Your answer</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {item.answer?.responseText ?? '—'}
          </p>
        </div>

        {e && (
          <div className="space-y-3 border-t border-rule pt-4">
            <div className="flex items-center gap-3">
              <p className="text-2xl font-medium text-ink tnum">{e.score.toFixed(0)}</p>
              <span className="text-xs text-muted">/ 100</span>
              <span
                className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${CORRECTNESS_STYLES[e.correctness] ?? CORRECTNESS_STYLES.PARTIALLY_CORRECT}`}
              >
                {CORRECTNESS_LABELS[e.correctness] ?? e.correctness}
              </span>
            </div>
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
      </div>
    </article>
  )
}

export default function ResultsView({ interviewId }) {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evaluating, setEvaluating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setResults(await getInterviewResults(interviewId))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [interviewId])

  useEffect(() => {
    load()
  }, [load])

  async function handleEvaluate() {
    setEvaluating(true)
    setError('')
    try {
      setResults(await evaluateInterview(interviewId))
    } catch (err) {
      setError(err.message)
    } finally {
      setEvaluating(false)
    }
  }

  if (loading) {
    return <RowsSkeleton rows={4} />
  }
  if (!results) {
    return <BlockError message={error || 'Could not load results.'} onRetry={load} />
  }

  const { interview, items } = results
  const evaluatedAll = results.evaluatedCount >= results.totalAnswered && results.totalAnswered > 0
  const hasFailures = results.failures?.length > 0
  const minutes =
    interview.startedAt && interview.completedAt
      ? Math.max(1, Math.round((Date.parse(interview.completedAt) - Date.parse(interview.startedAt)) / 60000))
      : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">{interview.roleTitle}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusPill status="COMPLETED" />
          {minutes != null && <span className="tnum">Took {minutes} min</span>}
          <span className="tnum">
            {results.totalAnswered} of {interview.questionCount} answered
          </span>
        </p>
        <p className="mt-2 text-xs text-muted">
          {results.feedbackSource === 'ai'
            ? 'AI-generated practice feedback. A signal for your preparation, not a guaranteed hiring outcome.'
            : 'Development feedback from the local fixture. Configure AI_API_KEY on the server for real AI feedback.'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule sm:grid-cols-4">
        {[
          { label: 'Answered', value: `${results.totalAnswered}` },
          { label: 'Questions', value: `${interview.questionCount}` },
          {
            label: 'Average score',
            value: results.avgScore != null ? results.avgScore.toFixed(1) : '—',
            muted: results.avgScore == null,
          },
          { label: 'Evaluated', value: `${results.evaluatedCount}` },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-1 bg-surface p-4">
            <dt className="text-xs text-muted">{cell.label}</dt>
            <dd className={`text-xl font-medium tnum ${cell.muted ? 'text-muted/50' : 'text-ink'}`}>
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>

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
      ) : evaluatedAll ? (
        <p className="text-sm text-muted">No weak topics detected in this interview.</p>
      ) : null}

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      {hasFailures && (
        <p role="alert" className="text-sm text-negative">
          {results.failures.length} answer{results.failures.length > 1 ? 's' : ''} could not be
          evaluated. You can retry; already-evaluated answers are kept.
        </p>
      )}

      {!evaluatedAll ? (
        <div className="flex items-center justify-between gap-4 rounded-[8px] border border-line bg-surface px-5 py-4">
          <p className="text-sm text-muted">
            {evaluating
              ? 'Evaluating your answers…'
              : 'Feedback is generated once per answer, after the interview.'}
          </p>
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="h-10 flex-none rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {evaluating ? 'Evaluating…' : hasFailures ? 'Retry feedback' : 'Get feedback'}
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <FeedbackCard key={item.question.id} item={item} />
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          to="/"
          className="h-9 rounded-[6px] border border-control bg-surface px-4 text-sm leading-9 text-ink hover:bg-raised"
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
