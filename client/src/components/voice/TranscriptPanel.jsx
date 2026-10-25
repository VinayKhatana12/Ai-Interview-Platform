// Transcript panel: real states of the voice-answer pipeline. The transcript
// comes from the server's transcription endpoint; success is shown only
// after a real response, errors carry a retry that resends the same
// recording, and submitting happens only when the candidate reviews the
// transcript and acts.
const STEPS = [
  { key: 'recorded', label: 'Recording captured' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'ready', label: 'Transcript ready' },
  { key: 'submitted', label: 'Answer submitted' },
]

export function TranscriptPanel({ status, transcript, error, onRetry, onUseAnswer }) {
  const stateOf = (key) => {
    if (status === 'idle') return 'pending'
    if (status === 'processing') return key === 'recorded' ? 'done' : key === 'transcribing' ? 'active' : 'pending'
    if (status === 'done') return key === 'recorded' || key === 'transcribing' || key === 'ready' ? 'done' : 'pending'
    // error: the recording exists; transcription did not complete.
    return key === 'recorded' ? 'done' : 'pending'
  }

  return (
    <section className="rounded-[8px] border border-line bg-surface">
      <div className="border-b border-rule px-5 py-4">
        <h3 className="text-base font-medium text-ink">Transcript</h3>
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
                  <span className={`text-xs ${st === 'pending' ? 'text-muted/70' : 'text-ink'}`}>
                    {i + 1}. {step.label}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>

        {status === 'idle' && (
          <p className="text-sm text-muted">
            Your spoken answer will appear here once recorded. The recording is sent for
            transcription when you stop; nothing is stored.
          </p>
        )}

        {status === 'processing' && (
          <p role="status" className="text-sm text-ink">
            Uploading your recording and transcribing it…
          </p>
        )}

        {status === 'done' && (
          <div className="space-y-3">
            <p className="text-xs text-muted">Transcript. Read it through before submitting; you can edit after switching to Typed.</p>
            <p className="whitespace-pre-wrap rounded-[6px] border border-rule bg-raised px-4 py-3 text-sm leading-relaxed text-ink">
              {transcript}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onUseAnswer}
                className="h-9 rounded-[6px] bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Review and submit
              </button>
              <span className="text-xs text-muted">Fills the answer editor so you can edit and submit for real.</span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-negative">{error}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="h-9 rounded-[6px] border border-control bg-surface px-4 text-sm text-ink hover:bg-raised"
              >
                Retry transcription
              </button>
              <span className="text-xs text-muted">Sends the same recording again. You can also record a new answer.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
