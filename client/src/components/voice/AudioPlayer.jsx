import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { api } from '../../api/client.js'
import { createSpeaker } from '../../services/speech.js'

// Question playback. Primary: the server's AI voice endpoint (binary audio,
// provider named in the X-Voice-Source header and shown honestly). If that
// fails or is unavailable, the browser's speech synthesis is offered as an
// explicitly labeled fallback — never presented as the AI voice. One
// generation per question is cached; everything is cleaned up when the
// question changes or the component unmounts.

const SOURCE_LABELS = { gemini: 'Gemini', openai: 'OpenAI' }

export function AudioPlayer({ interviewId, question, disabled = false }) {
  const browserSpeaker = useMemo(() => createSpeaker(), [])
  const [status, setStatus] = useState('idle') // idle|generating|ready|playing|paused|finished|error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [voiceSource, setVoiceSource] = useState(null) // 'gemini'|'openai'|'browser'
  const [mode, setMode] = useState('ai') // 'ai' | 'browser'
  const [browserStatus, setBrowserStatus] = useState('idle')

  const audioRef = useRef(null)
  const urlRef = useRef(null)
  const questionIdRef = useRef(null)
  const abortRef = useRef(null)
  const busyRef = useRef(false)
  const modeRef = useRef('ai')
  modeRef.current = mode

  const cleanupAudio = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    busyRef.current = false
  }, [])

  // Question changed (or component gone): stop everything so audio from the
  // previous question can never keep playing after advancing.
  useEffect(() => {
    questionIdRef.current = question?.id ?? null
    cleanupAudio()
    browserSpeaker.stop()
    setStatus('idle')
    setBrowserStatus('idle')
    setProgress(0)
    setError('')
    setVoiceSource(null)
    return () => {
      cleanupAudio()
      browserSpeaker.stop()
    }
  }, [question?.id, cleanupAudio, browserSpeaker])

  // Playback must not interfere with an active recording.
  useEffect(() => {
    if (disabled && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      setStatus('paused')
    }
    if (disabled && modeRef.current === 'browser') {
      browserSpeaker.stop()
      setBrowserStatus('idle')
    }
  }, [disabled, browserSpeaker])

  async function generateAndPlay() {
    if (busyRef.current || !question || questionIdRef.current !== question.id) return
    busyRef.current = true
    setError('')
    setStatus('generating')

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/interviews/${interviewId}/speech`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error?.message ?? 'Generating the voice failed. Try again.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setVoiceSource(res.headers.get('X-Voice-Source') === 'openai' ? 'openai' : 'gemini')

      const audio = new Audio(url)
      audioRef.current = audio
      audio.ontimeupdate = () => {
        if (audio.duration > 0) setProgress(audio.currentTime / audio.duration)
      }
      audio.onended = () => setStatus('finished')
      audio.onerror = () => {
        setStatus('error')
        setError('The generated audio could not be played. Try again, or use the browser voice.')
      }
      await audio.play()
      setStatus('playing')
    } catch (err) {
      if (err.name === 'AbortError') return
      setStatus('error')
      setError(err.message || 'Generating the voice failed. Try again.')
    } finally {
      busyRef.current = false
    }
  }

  function handlePlay() {
    if (mode === 'browser') return handleBrowserPlay()
    if (status === 'playing' && audioRef.current) {
      audioRef.current.pause()
      setStatus('paused')
      return
    }
    if (status === 'paused' && audioRef.current) {
      audioRef.current.play().then(() => setStatus('playing')).catch(() => setStatus('error'))
      return
    }
    if (status === 'ready' && audioRef.current) {
      audioRef.current.play().then(() => setStatus('playing')).catch(() => setStatus('error'))
      return
    }
    if (urlRef.current && audioRef.current) {
      // Cached audio (finished state): replay from the start.
      audioRef.current.currentTime = 0
      audioRef.current.play().then(() => setStatus('playing')).catch(() => setStatus('error'))
      return
    }
    generateAndPlay()
  }

  function handleReplay() {
    if (mode === 'browser') {
      browserSpeaker.stop()
      speakWithBrowser()
      return
    }
    if (audioRef.current && urlRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().then(() => setStatus('playing')).catch(() => setStatus('error'))
      return
    }
    generateAndPlay()
  }

  // ---- Browser fallback (system voice, explicitly not AI) ----
  function speakWithBrowser() {
    setBrowserStatus('preparing')
    browserSpeaker.speak({
      text: question.text,
      onState: (s, err) => {
        if (s === 'done') setBrowserStatus('finished')
        else if (s === 'error') {
          setBrowserStatus('error')
          setError(
            err === 'not-allowed'
              ? 'Speech was blocked by the browser. Check site permissions and try again.'
              : 'Browser speech failed. Try again.',
          )
        } else setBrowserStatus(s)
      },
    })
  }

  function handleBrowserPlay() {
    if (browserStatus === 'speaking') {
      browserSpeaker.pause()
      setBrowserStatus('paused')
    } else if (browserStatus === 'paused') {
      browserSpeaker.resume()
      setBrowserStatus('speaking')
    } else {
      speakWithBrowser()
    }
  }

  const inBrowserMode = mode === 'browser'
  const effectiveStatus = inBrowserMode ? browserStatus : status
  const generating = !inBrowserMode && status === 'generating'
  const playing = effectiveStatus === 'speaking' || effectiveStatus === 'playing'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={disabled || generating || (inBrowserMode && browserStatus === 'preparing')}
          className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-primary px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {playing ? (
            <Pause size={16} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Play size={16} strokeWidth={2} aria-hidden="true" />
          )}
          {playing ? 'Pause' : effectiveStatus === 'paused' ? 'Resume' : effectiveStatus === 'finished' ? 'Play again' : 'Play question'}
        </button>
        <button
          type="button"
          onClick={handleReplay}
          disabled={disabled || generating || (inBrowserMode && browserStatus === 'preparing')}
          className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-control bg-surface px-3.5 text-sm text-ink hover:bg-raised disabled:opacity-60"
        >
          <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          Replay
        </button>
        <span className="text-xs text-muted" role="status">
          {!inBrowserMode && status === 'generating' && 'Generating AI voice…'}
          {!inBrowserMode && status === 'playing' && 'Playing…'}
          {!inBrowserMode && status === 'paused' && 'Paused'}
          {!inBrowserMode && status === 'finished' && 'Finished'}
          {inBrowserMode && browserStatus === 'speaking' && 'Speaking…'}
          {inBrowserMode && browserStatus === 'paused' && 'Paused (browser)'}
          {inBrowserMode && browserStatus === 'finished' && 'Finished (browser)'}
        </span>
      </div>

      <div className="h-1 w-full max-w-[320px] overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-200"
          style={{ width: `${Math.round((inBrowserMode ? 0 : progress) * 100)}%` }}
          aria-hidden="true"
        />
      </div>

      {!inBrowserMode && error && (
        <div className="flex flex-col gap-1.5" role="alert">
          <p className="text-xs text-negative">{error}</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setError('')
                generateAndPlay()
              }}
              disabled={disabled}
              className="h-8 rounded-[6px] border border-control bg-surface px-3 text-sm text-ink hover:bg-raised disabled:opacity-60"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                setError('')
                setMode('browser')
                setBrowserStatus('idle')
              }}
              className="text-sm text-ink underline underline-offset-2 hover:opacity-80"
            >
              Use browser voice instead
            </button>
          </div>
        </div>
      )}

      {inBrowserMode && error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}

      <p className="text-xs text-muted">
        {inBrowserMode
          ? 'Browser system voice — not an AI voice.'
          : voiceSource
            ? `AI-generated voice (${SOURCE_LABELS[voiceSource] ?? voiceSource}).`
            : 'AI-generated voice from the server; falls back to the browser voice if unavailable.'}
      </p>
      {inBrowserMode && (
        <button
          type="button"
          onClick={() => {
            browserSpeaker.stop()
            setBrowserStatus('idle')
            setMode('ai')
            setError('')
          }}
          className="self-start text-sm text-muted underline underline-offset-2 hover:text-ink"
        >
          Back to AI voice
        </button>
      )}
    </div>
  )
}
