import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import {
  completeInterview,
  getInterviewSession,
  startInterview,
  submitAnswer,
} from '../api/interviews.js'
import { PageSkeleton } from '../components/Skeletons.jsx'
import { BlockError } from '../components/States.jsx'
import { SegmentedControl } from '../components/SegmentedControl.jsx'
import ResultsView from '../components/ResultsView.jsx'
import VoiceWorkspace from '../components/voice/VoiceWorkspace.jsx'
import { useRecorder } from '../hooks/useRecorder.js'

// The interview workspace: one question at a time, a timer derived from the
// server's clock, an answer editor whose draft survives refreshes, and
// submission states that never lose text. The server owns order, progress
// and completion; this screen only renders what it returns.

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function difficultyLabel(d) {
  return d[0] + d.slice(1).toLowerCase()
}

function draftKey(interviewId) {
  return `il:draft:${interviewId}`
}

// Small floating dialog (a dialog is one of the things allowed to cast a
// shadow, per app-screens §9.4).
function ConfirmLeaveDialog({ blocker, onDiscard, reason }) {
  const recording = reason === 'recording'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <div className="w-full max-w-[400px] rounded-[8px] border border-line bg-surface p-6 shadow-lg">
        <h2 id="leave-title" className="text-base font-medium text-ink">
          {recording ? 'Leave while recording?' : 'Leave with an unsaved answer?'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {recording
            ? 'Your recording is still running. Leaving stops it and keeps only what you submitted.'
            : 'Your draft stays on this device and will be restored if you come back, but it is not submitted until you press Submit answer.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => blocker.reset()}
            className="h-9 rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised"
          >
            {recording ? 'Keep recording' : 'Keep answering'}
          </button>
          <button
            onClick={() => {
              onDiscard()
              blocker.proceed()
            }}
            className="h-9 rounded-[6px] bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InterviewSession() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [answer, setAnswer] = useState('')
  const [restoredNote, setRestoredNote] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)
  // Answer mode is an interaction preference of the session screen; the
  // interview's stored mode is unchanged. Voice is a labeled prototype.
  const [answerMode, setAnswerMode] = useState(
    () => localStorage.getItem(`il:voice-pref:${id}`) === 'voice' ? 'voice' : 'typed',
  )
  const recorder = useRecorder()

  function switchAnswerMode(next) {
    if (['recording', 'requesting', 'stopping'].includes(recorder.state)) return
    setAnswerMode(next)
    localStorage.setItem(`il:voice-pref:${id}`, next)
  }

  const sessionRef = useRef(null)
  sessionRef.current = session
  const recorderStateRef = useRef('idle')
  recorderStateRef.current = recorder.state

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getInterviewSession(id)
      setSession(data)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Restore a draft left by a refresh or lost connection; drafts are keyed
  // per interview and only restored for the question they were written for.
  const question = session?.currentQuestion
  useEffect(() => {
    if (!question) return
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null')
      if (draft && draft.questionId === question.id && draft.text) {
        setAnswer(draft.text)
        setRestoredNote(true)
      } else {
        setAnswer('')
        setRestoredNote(false)
      }
    } catch {
      setAnswer('')
    }
  }, [id, question?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistDraft = useCallback(
    (text) => {
      if (!question) return
      if (text.trim()) {
        sessionStorage.setItem(draftKey(id), JSON.stringify({ questionId: question.id, text }))
      } else {
        sessionStorage.removeItem(draftKey(id))
      }
    },
    [id, question],
  )

  function onAnswerChange(text) {
    setAnswer(text)
    // Feedback from the previous submit clears when the candidate starts
    // writing the next answer, not on question change (which would wipe it
    // before it can be read).
    setSavedNote('')
    setSubmitError('')
    persistDraft(text)
  }

  // Warn on refresh / tab close with an unsaved draft (in-app navigation is
  // handled by the blocker below).
  const hasDraft = answer.trim().length > 0
  useEffect(() => {
    function onBeforeUnload(e) {
      if (hasDraft) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasDraft])

  // Reset any leftover recording when the question advances (never mid-recording).
  useEffect(() => {
    if (!question) return
    recorder.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, question?.id])

  const shouldBlock = useCallback(
    () => {
      if (sessionRef.current?.phase !== 'in_progress') return false
      if (['recording', 'requesting', 'stopping'].includes(recorderStateRef.current)) return true
      return Boolean(answer.trim())
    },
    [answer],
  )
  const blocker = useBlocker(shouldBlock)
  const leaveReason = ['recording', 'requesting', 'stopping'].includes(recorderStateRef.current)
    ? 'recording'
    : 'draft'

  // Server clock offset so the countdown matches the server's deadline,
  // not the device's clock.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!session || !session.deadline) return
    const offset = Date.parse(session.serverNow) - Date.now()
    const tick = () => setNow(Date.now() + offset)
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session?.serverNow, session?.deadline]) // eslint-disable-line react-hooks/exhaustive-deps

  const remainingSeconds = useMemo(() => {
    if (!session?.deadline) return null
    return (Date.parse(session.deadline) - now) / 1000
  }, [session?.deadline, now])

  async function handleSubmit() {
    if (!question || submitting) return
    setSubmitError('')
    setSubmitting(true)
    try {
      const view = await submitAnswer(id, question.id, answer.trim())
      sessionStorage.removeItem(draftKey(id))
      setSession(view)
      setSavedNote(view.alreadyRecorded ? 'This answer was already saved' : 'Answer saved')
    } catch (err) {
      // Text stays in the editor; retry resubmits safely (idempotent).
      setSubmitError(`${err.message} Your answer is still in the editor.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStart() {
    setStarting(true)
    setLoadError('')
    try {
      setSession(await startInterview(id))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setStarting(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    setLoadError('')
    try {
      setSession(await completeInterview(id))
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setCompleting(false)
    }
  }

  if (loading) return <PageSkeleton />

  if (!session) {
    return (
      <div className="mx-auto max-w-[720px] pt-8">
        <BlockError message={loadError || 'Could not load this interview.'} onRetry={load} />
      </div>
    )
  }

  const { interview, progress } = session

  // ---- Completed: results with AI feedback ----
  if (session.phase === 'completed') {
    return <ResultsView interviewId={id} />
  }

  // ---- Ready (PENDING): recap + start ----
  if (session.phase === 'ready') {
    return (
      <div className="mx-auto max-w-[720px] space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-ink">{interview.roleTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {interview.questionCount} questions · {interview.durationMinutes} minutes ·{' '}
            {difficultyLabel(interview.difficulty)}
          </p>
        </div>
        {loadError && (
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
        )}
        <section className="rounded-[8px] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-medium text-ink">Ready to begin</h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            <div className="flex items-baseline justify-between border-b border-rule pb-3">
              <dt className="text-sm text-muted">Topics</dt>
              <dd className="text-right text-sm text-ink">{interview.topics.join(' · ')}</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-rule pb-3">
              <dt className="text-sm text-muted">Questions</dt>
              <dd className="text-sm text-ink tnum">{interview.questionCount}</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-rule pb-3">
              <dt className="text-sm text-muted">Duration</dt>
              <dd className="text-sm text-ink tnum">{interview.durationMinutes} minutes</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-rule pb-3">
              <dt className="text-sm text-muted">Mode</dt>
              <dd className="text-sm text-ink">Text</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Development question set. The AI interviewer connects in the next milestone.
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <Link to="/history" className="text-sm text-muted underline underline-offset-2 hover:text-ink">
              Back to history
            </Link>
            <button
              onClick={handleStart}
              disabled={starting}
              className="h-10 rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {starting ? 'Starting…' : 'Start interview'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  // ---- all_answered / time expired: finish ----
  if (session.phase === 'all_answered' || session.timeExpired) {
    return (
      <div className="mx-auto max-w-[720px] space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-ink">{interview.roleTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {session.phase === 'all_answered'
              ? `All ${progress.total} answers submitted.`
              : 'Time is up.'}{' '}
            {session.phase !== 'all_answered' &&
              `${progress.answered} of ${progress.total} answered.`}
          </p>
        </div>
        {loadError && (
          <p role="alert" className="text-sm text-negative">
            {loadError}
          </p>
        )}
        <section className="rounded-[8px] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-medium text-ink">Finish the interview</h2>
          <p className="mt-2 text-sm text-muted">
            Finishing locks your answers. Scores and feedback arrive with the AI evaluation
            milestone.
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <Link to="/history" className="text-sm text-muted underline underline-offset-2 hover:text-ink">
              Back to history
            </Link>
            <button
              onClick={handleComplete}
              disabled={completing}
              className="h-10 rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {completing ? 'Finishing…' : 'Finish interview'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  // ---- in_progress: the workspace ----
  const progressPct = progress.total ? (progress.answered / progress.total) * 100 : 0
  const lowTime = remainingSeconds != null && remainingSeconds < 300

  return (
    <div className="mx-auto max-w-[840px] space-y-5">
      {blocker.state === 'blocked' && (
        <ConfirmLeaveDialog
          blocker={blocker}
          reason={leaveReason}
          onDiscard={() => {
            sessionStorage.removeItem(draftKey(id))
            if (recorder.state === 'recording') recorder.stop()
          }}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-medium text-ink">{interview.roleTitle}</h1>
          <p className="mt-1.5 text-sm text-muted tnum">
            Question {progress.answered + 1} of {progress.total} ·{' '}
            {difficultyLabel(interview.difficulty)}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {remainingSeconds != null && (
            <p className={`text-sm tnum ${lowTime ? 'text-[#92400e]' : 'text-muted'}`} aria-label="Time remaining">
              {fmtClock(remainingSeconds)}
            </p>
          )}
          <Link to="/history" className="text-sm text-muted underline underline-offset-2 hover:text-ink">
            Exit
          </Link>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={progress.answered} aria-valuemin={0} aria-valuemax={progress.total}>
        <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {answerMode === 'voice' ? 'Voice practice is a prototype until transcription arrives.' : ''}
        </p>
        <SegmentedControl
          ariaLabel="Answer mode"
          value={answerMode}
          onChange={switchAnswerMode}
          options={[
            { value: 'typed', label: 'Typed' },
            { value: 'voice', label: 'Voice (prototype)' },
          ]}
        />
      </div>

      {answerMode === 'voice' ? (
        <VoiceWorkspace question={question} recorder={recorder} onSwitchToTyped={() => switchAnswerMode('typed')} />
      ) : (
      <section className="rounded-[8px] border border-line bg-surface">
        <div className="border-b border-rule px-5 py-2.5 sm:px-6">
          <p className="text-xs text-muted">
            {question.topic} · {difficultyLabel(question.difficulty)} · {question.questionType}
          </p>
        </div>
        <div className="px-5 py-6 sm:px-6">
          <p className="text-lg font-medium leading-relaxed text-ink">{question.text}</p>

          <div className="mt-6 flex flex-col gap-1.5">
            <label htmlFor="answer" className="text-sm font-medium text-ink">
              Your answer
            </label>
            <textarea
              id="answer"
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              maxLength={8000}
              disabled={submitting}
              placeholder="Write your answer. It stays saved on this device until you submit."
              className="min-h-[220px] w-full resize-y rounded-[6px] border border-control bg-surface p-3 text-base text-ink placeholder:text-muted/70 focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink disabled:opacity-60"
            />
            {restoredNote && (
              <p className="text-xs text-muted">Restored your unsaved draft from this device.</p>
            )}
            {submitError && (
              <p role="alert" className="text-sm text-negative">
                {submitError}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-rule px-5 py-4 sm:px-6">
          <p role="status" className="text-sm text-muted">
            {submitting ? 'Submitting…' : savedNote}
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitting || !answer.trim()}
            className="h-10 flex-none rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit answer'}
          </button>
        </div>
      </section>
      )}
    </div>
  )
}
