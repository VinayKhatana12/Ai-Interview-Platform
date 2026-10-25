import { useCallback, useEffect, useRef, useState } from 'react'

// Browser microphone capture via MediaRecorder, isolated from AI services.
// States: idle | requesting | recording | stopping | denied | error | unsupported
// The recording exists only in memory (object URL); nothing is uploaded and
// nothing is stored beyond the component's life.
const MIN_VALID_BLOB_BYTES = 1000
const MIN_VALID_DURATION_S = 0.4

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of ['audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported?.(type)) return type
  }
  return ''
}

export function useRecorder() {
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [recordingUrl, setRecordingUrl] = useState(null)
  const [recordingBlob, setRecordingBlob] = useState(null)
  const [recordingSize, setRecordingSize] = useState(0)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const rafRef = useRef(0)
  const timerRef = useRef(0)
  const startedAtRef = useRef(0)
  const chunksRef = useRef([])
  const urlRef = useRef(null)
  const stateRef = useRef('idle')
  const mountedRef = useRef(true)

  const setSt = (next) => {
    stateRef.current = next
    if (mountedRef.current) setState(next)
  }

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    analyserRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    if (mountedRef.current) {
      setLevel(0)
      setElapsed(0)
    }
  }, [])

  const discardRecording = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    chunksRef.current = []
    if (mountedRef.current) {
      setRecordingUrl(null)
      setRecordingBlob(null)
      setRecordingSize(0)
    }
  }, [])

  // Cleanup every resource when recording ends or the component unmounts.
  useEffect(() => {
    mountedRef.current = true
    return () => {
    mountedRef.current = false
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch {
      /* already stopped */
    }
      teardown()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [teardown])

  const start = useCallback(async () => {
    const s = stateRef.current
    if (s === 'recording' || s === 'requesting' || s === 'stopping') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser.')
      setSt('unsupported')
      return
    }

    setError('')
    discardRecording()
    setSt('requesting')

    let stream
    try {
      // Called only from an explicit user action (the mic button).
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Allow it in your browser settings and try again.')
        setSt('denied')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setError('No microphone was found on this device.')
        setSt('error')
      } else {
        setError('Could not access the microphone. ' + (err?.message ?? ''))
        setSt('error')
      }
      return
    }

    streamRef.current = stream
    try {
      // Level metering for the live waveform.
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      analyserRef.current = analyser
      const buffer = new Uint8Array(analyser.fftSize)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buffer.length)
        // Perceptual-ish scaling so normal speech reads mid-scale.
        if (mountedRef.current) setLevel((prev) => prev * 0.4 + Math.min(1, rms * 4) * 0.6)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const durationS = (performance.now() - startedAtRef.current) / 1000
        teardown()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < MIN_VALID_BLOB_BYTES || durationS < MIN_VALID_DURATION_S) {
          discardRecording()
          setError('The recording was empty. Hold the button state and speak, then stop.')
          setSt('error')
          return
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = URL.createObjectURL(blob)
        if (mountedRef.current) {
          setRecordingUrl(urlRef.current)
          setRecordingBlob(blob)
          setRecordingSize(blob.size)
        }
        setSt('idle')
      }
      // Interrupted recordings (mic unplugged, system takeover) land in onstop.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (stateRef.current === 'recording' && recorderRef.current?.state === 'recording') {
          try {
            recorderRef.current.stop()
          } catch {
            /* teardown still runs below */
          }
        }
      })

      startedAtRef.current = performance.now()
      setElapsed(0)
      timerRef.current = setInterval(() => {
        if (mountedRef.current) {
          setElapsed((performance.now() - startedAtRef.current) / 1000)
        }
      }, 250)
      recorder.start(250)
      setSt('recording')
    } catch (err) {
      teardown()
      stream.getTracks().forEach((t) => t.stop())
      setError('Could not start recording. ' + (err?.message ?? ''))
      setSt('error')
    }
  }, [discardRecording, teardown])

  const stop = useCallback(() => {
    if (stateRef.current !== 'recording') return
    setSt('stopping')
    try {
      recorderRef.current?.stop()
    } catch {
      teardown()
      setSt('idle')
    }
  }, [teardown])

  const reset = useCallback(() => {
    if (stateRef.current === 'recording' || stateRef.current === 'requesting' || stateRef.current === 'stopping') return
    discardRecording()
    setError('')
    setSt('idle')
  }, [discardRecording])

  return { state, stateRef, error, level, elapsed, recordingUrl, recordingBlob, recordingSize, start, stop, reset }
}
