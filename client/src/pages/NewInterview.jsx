import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createInterview } from '../api/interviews.js'
import { Field } from '../components/Field.jsx'
import { FormError } from '../components/FormError.jsx'
import { SegmentedControl } from '../components/SegmentedControl.jsx'
import { TopicPicker } from '../components/TopicPicker.jsx'
import { EXPERIENCE_LABELS } from '../utils/format.js'

// Catalogs mirror the server's allowed values exactly.
const TOPICS = [
  'JavaScript',
  'React',
  'Node.js',
  'TypeScript',
  'Data Structures & Algorithms',
  'DBMS',
  'System Design',
  'Operating Systems',
  'Networks',
  'OOP',
]

const SUGGESTED_ROLES = [
  'Java Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Frontend Developer',
  'Node.js Developer',
  'React Developer',
]

const DURATIONS = Array.from({ length: 17 }, (_, i) => 10 + i * 5) // 10..90 by 5

export default function NewInterview() {
  const navigate = useNavigate()

  const [roleTitle, setRoleTitle] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('0-1')
  const [interviewType, setInterviewType] = useState('TECHNICAL')
  const [difficulty, setDifficulty] = useState('MEDIUM')
  const [topics, setTopics] = useState([])
  const [customTopic, setCustomTopic] = useState('')
  const [mode, setMode] = useState('TEXT')
  const [questionCount, setQuestionCount] = useState(5)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function toggleTopic(topic) {
    setTopics((prev) =>
      prev.some((t) => t.toLowerCase() === topic.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== topic.toLowerCase())
        : prev.length < 5
          ? [...prev, topic]
          : prev,
    )
  }

  function addCustomTopic() {
    const topic = customTopic.trim()
    setFieldErrors((prev) => ({ ...prev, customTopic: undefined }))
    if (topic.length < 2 || topic.length > 40) {
      setFieldErrors((prev) => ({ ...prev, customTopic: 'Topics are 2-40 characters' }))
      return
    }
    if (topics.some((t) => t.toLowerCase() === topic.toLowerCase())) {
      setFieldErrors((prev) => ({ ...prev, customTopic: 'That topic is already selected' }))
      return
    }
    if (topics.length >= 5) {
      setFieldErrors((prev) => ({ ...prev, customTopic: 'At most five topics' }))
      return
    }
    setTopics((prev) => [...prev, topic])
    setCustomTopic('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setApiError('')

    const next = {}
    if (roleTitle.trim().length < 2) next.roleTitle = 'Enter the role you are preparing for'
    if (topics.length === 0) next.topics = 'Pick at least one topic'
    if (Object.keys(next).length) {
      setFieldErrors(next)
      return
    }

    setSubmitting(true)
    try {
      const created = await createInterview({
        roleTitle: roleTitle.trim(),
        experienceLevel,
        interviewType,
        difficulty,
        topics,
        mode,
        questionCount,
        durationMinutes,
      })
      // Straight into the created interview, which shows the chosen settings.
      navigate(`/interviews/${created.interview.id}`)
    } catch (err) {
      if (err.details) setFieldErrors(err.details)
      else setApiError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">New interview</h1>
        <p className="mt-1.5 text-sm text-muted">
          Set up a practice interview for your target role.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-[8px] border border-line bg-surface p-5 sm:p-6">
        <FormError message={apiError} />

        <Field
          id="roleTitle"
          label="Target role"
          value={roleTitle}
          onChange={setRoleTitle}
          error={fieldErrors.roleTitle}
          hint="Pick a suggestion or type your own"
          autoComplete="off"
          autoFocus
          disabled={submitting}
          list="suggested-roles"
        />
        <datalist id="suggested-roles">
          {SUGGESTED_ROLES.map((role) => (
            <option key={role} value={role} />
          ))}
        </datalist>

        <Field
          id="experienceLevel"
          label="Experience level"
          type="select"
          value={experienceLevel}
          onChange={setExperienceLevel}
          disabled={submitting}
        >
          {Object.entries(EXPERIENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Interview type</span>
          <SegmentedControl
            ariaLabel="Interview type"
            value={interviewType}
            onChange={setInterviewType}
            options={[
              { value: 'TECHNICAL', label: 'Technical' },
              { value: 'BEHAVIORAL', label: 'Behavioral' },
              { value: 'MIXED', label: 'Mixed' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Difficulty</span>
          <SegmentedControl
            ariaLabel="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'EASY', label: 'Easy' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HARD', label: 'Hard' },
            ]}
          />
        </div>

        <TopicPicker topics={TOPICS} selected={topics} onToggle={toggleTopic} max={5} error={fieldErrors.topics} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="customTopic" className="text-sm font-medium text-ink">
            Add your own topic
          </label>
          <div className="flex gap-2">
            <input
              id="customTopic"
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomTopic()
                }
              }}
              maxLength={40}
              placeholder="e.g. React Testing Library"
              disabled={submitting}
              aria-invalid={fieldErrors.customTopic ? true : undefined}
              aria-describedby={fieldErrors.customTopic ? 'customTopic-error' : 'customTopic-hint'}
              className={`h-10 flex-1 rounded-[6px] border bg-surface px-3 text-base text-ink placeholder:text-muted/70 disabled:opacity-60 ${
                fieldErrors.customTopic ? 'border-negative' : 'border-control'
              } focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink`}
            />
            <button
              type="button"
              onClick={addCustomTopic}
              disabled={submitting || topics.length >= 5}
              className="h-10 flex-none rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised disabled:opacity-60"
            >
              Add
            </button>
          </div>
          {fieldErrors.customTopic ? (
            <p id="customTopic-error" role="alert" className="text-xs text-negative">
              {fieldErrors.customTopic}
            </p>
          ) : (
            <p id="customTopic-hint" className="text-xs text-muted">
              Practising something outside the list? Add it here.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Mode</span>
          <SegmentedControl
            ariaLabel="Interview mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'TEXT', label: 'Text' },
              { value: 'VOICE', label: 'Voice' },
            ]}
          />
          <p className="text-xs text-muted">
            {mode === 'VOICE'
              ? 'The interview opens in the voice workspace; your recording is transcribed for review before submitting.'
              : 'Type your answers in the editor. You can still switch to voice inside the interview.'}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="questionCount"
            label="Questions"
            type="select"
            value={String(questionCount)}
            onChange={(v) => setQuestionCount(Number(v))}
            disabled={submitting}
          >
            {Array.from({ length: 13 }, (_, i) => 3 + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Field>
          <Field
            id="durationMinutes"
            label="Duration"
            type="select"
            value={String(durationMinutes)}
            onChange={(v) => setDurationMinutes(Number(v))}
            hint="Minutes, in steps of five"
            disabled={submitting}
          >
            {DURATIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-rule pt-5">
          <Link to="/dashboard" className="text-sm text-muted underline underline-offset-2 hover:text-ink">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-[6px] bg-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create interview'}
          </button>
        </div>
      </form>
    </div>
  )
}
