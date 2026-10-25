import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { createSpeaker } from '../../services/speech.js'

// Question playback. The current implementation is the browser's built-in
// speech synthesis — a system voice, not an AI service — and says so in a
// quiet caption. The speaker service is the seam the AI voice API plugs
// into (Phase 2.2) without changes here.
export function AudioPlayer({ text, disabled = false }) {
  const speaker = useMemo(() => createSpeaker(), [])
  const [status, setStatus] = useState('idle') // idle|preparing|speaking|paused|done|error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const textRef = useRef(text)

  useEffect(() => {
    textRef.current = text
  }, [text])

  // Question changed or component gone: stop any playback.
  useEffect(() => {
    speaker.stop()
    setStatus('idle')
    setProgress(0)
    setError('')
    return () => speaker.stop()
  }, [speaker, text])

  function handlePlay() {
    setError('')
    if (status === 'speaking') {
      speaker.pause()
      setStatus('paused')
      return
    }
    if (status === 'paused') {
      speaker.resume()
      setStatus('speaking')
      return
    }
    setStatus('preparing')
    speaker.speak({
      text: textRef.current,
      onState: (s, err) => {
        if (s === 'done') {
          setStatus('done')
          setProgress(1)
        } else if (s === 'error') {
          setStatus('error')
          setError(
            err === 'not-allowed'
              ? 'Speech was blocked by the browser. Check site permissions and try again.'
              : 'Speech playback failed. Try again.',
          )
        } else {
          setStatus(s)
        }
      },
      onProgress: setProgress,
    })
  }

  function handleReplay() {
    speaker.stop()
    setStatus('preparing')
    setProgress(0)
    speaker.speak({
      text: textRef.current,
      onState: (s, err) => {
        if (s === 'done') {
          setStatus('done')
          setProgress(1)
        } else if (s === 'error') {
          setStatus('error')
          setError('Speech playback failed. Try again.')
        } else {
          setStatus(s)
        }
      },
      onProgress: setProgress,
    })
  }

  if (!speaker.supported) {
    return (
      <p className="text-sm text-muted">
        This browser cannot speak the question aloud. Read it below, or use Chrome or Edge.
      </p>
    )
  }

  const playing = status === 'speaking' || status === 'preparing'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={disabled || status === 'preparing'}
          className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {status === 'speaking' ? (
            <Pause size={16} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Play size={16} strokeWidth={2} aria-hidden="true" />
          )}
          {status === 'speaking' ? 'Pause' : status === 'paused' ? 'Resume' : status === 'done' ? 'Play again' : 'Play question'}
        </button>
        <button
          type="button"
          onClick={handleReplay}
          disabled={disabled || status === 'preparing'}
          className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-control bg-surface px-3.5 text-sm text-ink hover:bg-raised disabled:opacity-60"
        >
          <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          Replay
        </button>
        <span className="text-xs text-muted" role="status">
          {status === 'preparing' && 'Preparing audio…'}
          {status === 'speaking' && 'Speaking…'}
          {status === 'paused' && 'Paused'}
          {status === 'done' && 'Finished'}
          {status === 'error' && 'Playback failed'}
        </span>
      </div>

      <div className="h-1 w-full max-w-[320px] overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-200"
          style={{ width: `${Math.round(progress * 100)}%` }}
          aria-hidden="true"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">Browser speech synthesis, not an AI voice. AI playback arrives in Phase 2.2.</p>
    </div>
  )
}
