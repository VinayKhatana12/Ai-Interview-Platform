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

const DURATIONS = Array.from({ length: 17 }, (_, i) => 10 + i * 5) // 10..90 by 5

export default function NewInterview() {
  const navigate = useNavigate()

  const [roleTitle, setRoleTitle] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('0-1')
  const [difficulty, setDifficulty] = useState('MEDIUM')
  const [topics, setTopics] = useState([])
  const [questionCount, setQuestionCount] = useState(5)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function toggleTopic(topic) {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : prev.length < 5 ? [...prev, topic] : prev,
    )
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
      await createInterview({
        roleTitle: roleTitle.trim(),
        experienceLevel,
        difficulty,
        topics,
        mode: 'TEXT',
        questionCount,
        durationMinutes,
      })
      navigate('/history', { state: { created: roleTitle.trim() } })
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
          label="Role title"
          value={roleTitle}
          onChange={setRoleTitle}
          error={fieldErrors.roleTitle}
          hint="e.g. Frontend Developer, Backend Engineer"
          autoComplete="off"
          autoFocus
          disabled={submitting}
        />

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
          <span className="text-sm font-medium text-ink">Mode</span>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              ariaLabel="Interview mode"
              value="TEXT"
              onChange={() => {}}
              options={[
                { value: 'TEXT', label: 'Text' },
                { value: 'VOICE', label: 'Voice', disabled: true },
              ]}
            />
            <p className="text-xs text-muted">Voice interviews arrive with the AI milestone.</p>
          </div>
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
            {Array.from({ length: 8 }, (_, i) => 3 + i).map((n) => (
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
