// Text-to-speech seam for question playback.
//
// TODAY: the browser's built-in speechSynthesis — a local system voice,
// explicitly NOT an AI voice service, and presented as such in the UI.
// PHASE 2.2: an AI voice provider implements this same interface; nothing
// above this module changes.
//
// Interface: createSpeaker() -> {
//   supported: boolean,
//   speak({ text, onState, onProgress })   // onState: 'speaking' | 'done' | 'error'
//   pause(), resume(), stop()
// }
export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function createSpeaker() {
  if (!speechSupported()) {
    return {
      supported: false,
      speak() {
        throw new Error('Speech synthesis is not supported in this browser.')
      },
      pause() {},
      resume() {},
      stop() {},
    }
  }

  let utterance = null

  function stop() {
    window.speechSynthesis.cancel()
    utterance = null
  }

  return {
    supported: true,

    speak({ text, onState, onProgress }) {
      stop()
      utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1

      utterance.onstart = () => onState?.('speaking')
      utterance.onend = () => onState?.('done')
      utterance.onerror = (e) => onState?.('error', e.error ?? 'unknown')
      // Approximate progress from word boundaries; not every engine fires
      // this, so the UI treats progress as best-effort.
      utterance.onboundary = (e) => {
        if (text.length > 0 && typeof e.charIndex === 'number') {
          onProgress?.(Math.min(1, e.charIndex / text.length))
        }
      }

      onState?.('preparing')
      window.speechSynthesis.speak(utterance)
    },

    pause() {
      if (window.speechSynthesis.speaking) window.speechSynthesis.pause()
    },
    resume() {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    },
    stop,
  }
}
