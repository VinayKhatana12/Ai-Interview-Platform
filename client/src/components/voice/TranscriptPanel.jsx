import { useEffect, useState } from 'react'

// The future voice workflow, made explicit as a pipeline:
//   recorded -> transcribing -> transcript validated -> submitted
// Phase 2.1 simulates the transcribing step for UI demonstration only and
// stops there: the real transcription service connects in Phase 2.2. No
// transcript is fabricated and no answer is submitted from this panel.
const STEPS = [
  { key: 'recorded', label: 'Recording captured', future: false },
  { key: 'transcribing', label: 'Transcribing', future: false },
  { key: 'validated', label: 'Transcript validated', future: true },
  { key: 'submitted', label: 'Answer submitted', future: true },
]

export function TranscriptPanel({ recorderState, hasRecording, recordingUrl, onSwitchToTyped }) {
  const [simulated, setSimulated] = useState('idle') // idle | processing | stopped-here

  // When a recording lands, run the clearly-labeled prototype simulation.
  useEffect(() => {
    if (hasRecording) {
      setSimulated('processing')
      const t = setTimeout(() => setSimulated('stopped-here'), 1600)
      return () => clearTimeout(t)
    }
    setSimulated('idle')
  }, [hasRecording, recordingUrl])

  const stateOf = (key) => {
    const idx = STEPS.findIndex((s) => s.key === key)
    if (!hasRecording) return 'pending'
    if (simulated === 'processing') return idx === 0 ? 'done' : idx === 1 ? 'active' : 'pending'
    // Simulation finished: everything after transcription is future work.
    return idx <= 1 ? 'done' : 'pending'
  }

  return (
    <section className="rounded-[8px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-4">
        <h3 className="text-base font-medium text-ink">Transcript</h3>
        <span className="inline-flex h-6 items-center rounded-full bg-[#fffbeb] px-2.5 text-xs font-medium text-[#92400e]">
          Prototype
        </span>
      </div>
      <div className="space-y-4 px-5 py-5">
        <ol className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((step, i) => {
            const st = stateOf(step.key)
            return (
              <li key={step.key} className="flex items-baseline gap-2 sm:flex-col sm:gap-1">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 flex-none rounded-full ${
                      st === 'done' ? 'bg-ink' : st === 'active' ? 'animate-pulse bg-[#1d5fbf] motion-reduce:animate-none' : 'bg-raised'
                    }`}
                  />
                  <span
                    className={`text-xs ${st === 'pending' ? 'text-muted/70' : 'text-ink'}`}
                  >
                    {i + 1}. {step.label}
                  </span>
                </span>
                {step.future && <span className="pl-3.5 text-[11px] text-muted/70 sm:pl-0">Phase 2.2</span>}
              </li>
            )
          })}
        </ol>

        {!hasRecording && (
          <p className="text-sm text-muted">
            Your spoken answer will appear here once recorded. Recording stays on this device.
          </p>
        )}

        {simulated === 'processing' && (
          <p role="status" className="text-sm text-ink">
            Transcribing your recording<span className="text-muted"> (simulated for this prototype, ~2 s)</span>…
          </p>
        )}

        {simulated === 'stopped-here' && (
          <div className="space-y-2">
            <p role="status" className="text-sm text-[#92400e]">
              The transcription service is not connected yet. This recording was processed by a local
              simulation only, no transcript was produced, and nothing was submitted.
            </p>
            <p className="text-sm text-muted">
              To submit this answer now,{' '}
              <button
                type="button"
                onClick={onSwitchToTyped}
                className="text-ink underline underline-offset-2 hover:opacity-80"
              >
                switch to Typed
              </button>{' '}
              and submit your text through the real interview engine. Voice submission arrives with
              transcription in Phase 2.2.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
