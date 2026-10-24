// One interview row, shared by Dashboard (capped) and History (full list).
// Desktop: identity left, figures right-aligned tabular. Phone: identity and
// status; figures fold into the subline (app-screens §12). Actionable rows
// (draft or in progress) carry one ink text action in a fixed trailing slot.
import { Link } from 'react-router-dom'
import { StatusPill } from './StatusPill.jsx'
import { formatDateShort, scoreText } from '../utils/format.js'

export function InterviewRow({ interview }) {
  const action =
    interview.status === 'PENDING'
      ? { label: 'Start', to: `/interviews/${interview.id}` }
      : interview.status === 'IN_PROGRESS'
        ? { label: 'Resume', to: `/interviews/${interview.id}` }
        : null

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{interview.roleTitle}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {interview.topics.join(' · ')}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted md:hidden tnum">
          {interview.questionCount} questions · {interview.durationMinutes} min ·{' '}
          {interview.difficulty[0] + interview.difficulty.slice(1).toLowerCase()}
          {interview.score != null ? ` · Score ${scoreText(interview.score)}` : ''}
        </p>
      </div>
      <div className="hidden items-center gap-6 md:flex">
        <span className="w-16 text-sm text-muted">
          {interview.difficulty[0] + interview.difficulty.slice(1).toLowerCase()}
        </span>
        <span className="w-14 text-right text-sm text-ink tnum">{interview.questionCount}</span>
        <span
          className={`w-12 text-right text-sm tnum ${interview.score != null ? 'text-ink' : 'text-muted/60'}`}
        >
          {scoreText(interview.score)}
        </span>
        <span className="w-24 text-right text-xs text-muted">{formatDateShort(interview.createdAt)}</span>
        <StatusPill status={interview.status} />
        {action && (
          <Link
            to={action.to}
            className="w-14 text-right text-sm font-medium text-ink underline underline-offset-2 hover:opacity-80"
          >
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 md:hidden">
        <StatusPill status={interview.status} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{formatDateShort(interview.createdAt)}</span>
          {action && (
            <Link to={action.to} className="text-sm font-medium text-ink underline underline-offset-2">
              {action.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
