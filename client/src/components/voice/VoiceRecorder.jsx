import { Mic, Square } from 'lucide-react'
import { AudioWaveform } from './AudioWaveform.jsx'

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// The microphone control: one prominent button whose state machine comes
// from useRecorder. Permission is requested only by pressing it. While
// recording the button carries the recording-status red; the waveform
// carries the data hue.
export function VoiceRecorder({ recorder }) {
  const { state, error, level, elapsed, recordingUrl, start, stop, reset } = recorder
  const busy = state === 'requesting' || state === 'stopping'
  const recording = state === 'recording'

  let statusLine = 'Press the microphone to record your answer.'
  if (state === 'requesting') statusLine = 'Requesting microphone permission…'
  if (recording) statusLine = 'Recording. Speak your answer, then press stop.'
  if (state === 'stopping') statusLine = 'Stopping…'
  if (state === 'denied') statusLine = error
  if (state === 'error') statusLine = error
  if (state === 'unsupported') statusLine = error

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={busy}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        aria-pressed={recording}
        className={`flex h-16 w-16 items-center justify-center rounded-full text-white transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60 ${
          recording
            ? 'animate-pulse bg-[#c4242a] motion-reduce:animate-none'
            : 'bg-primary hover:opacity-90'
        }`}
      >
        {recording ? (
          <Square size={22} strokeWidth={2} aria-hidden="true" className="fill-white" />
        ) : (
          <Mic size={24} strokeWidth={2} aria-hidden="true" />
        )}
      </button>

      <p
        role={state === 'denied' || state === 'error' || state === 'unsupported' ? 'alert' : 'status'}
        className={`max-w-[420px] text-center text-sm ${
          state === 'denied' || state === 'error' || state === 'unsupported' ? 'text-negative' : 'text-muted'
        }`}
      >
        {statusLine}
      </p>

      {(recording || state === 'stopping') && (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-sm text-ink tnum" aria-label="Recording duration">
            {fmt(elapsed)}
          </p>
          <div className="w-full max-w-[420px]">
            <AudioWaveform level={level} active={recording} />
          </div>
        </div>
      )}

      {recordingUrl && !recording && state !== 'stopping' && (
        <div className="flex w-full max-w-[420px] flex-col items-center gap-2 rounded-[6px] bg-raised px-4 py-3">
          <p className="text-xs text-muted">Recorded. Plays back locally only, never uploaded.</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls preload="metadata" src={recordingUrl} className="w-full" />
          <button type="button" onClick={reset} className="text-sm text-ink underline underline-offset-2 hover:opacity-80">
            Discard and record again
          </button>
        </div>
      )}
    </div>
  )
}
