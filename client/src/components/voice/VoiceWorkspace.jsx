import { AudioPlayer } from './AudioPlayer.jsx'
import { VoiceRecorder } from './VoiceRecorder.jsx'
import { TranscriptPanel } from './TranscriptPanel.jsx'

// Voice view of a question: listen, record, transcribe, review. Recording
// stops -> the audio is sent to the authenticated transcription endpoint ->
// the real transcript is shown -> the candidate reviews and submits through
// the existing text engine. Question playback uses browser speech synthesis
// until the AI voice provider connects.
export default function VoiceWorkspace({ interviewId, question, recorder, transcription, onRetryTranscription, onUseAnswer }) {
  const recorderBusy = ['recording', 'requesting', 'stopping'].includes(recorder.state)
  const busy = recorderBusy || transcription.status === 'processing'

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-line bg-surface px-5 py-5 sm:px-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Listen to the question</h3>
        <AudioPlayer interviewId={interviewId} question={question} disabled={recorderBusy} />
      </section>

      <section className="rounded-[8px] border border-line bg-surface px-5 py-6 sm:px-6">
        <h3 className="mb-4 text-sm font-medium text-ink">Record your answer</h3>
        <VoiceRecorder recorder={recorder} disabled={transcription.status === 'processing'} />
      </section>

      <TranscriptPanel
        status={transcription.status}
        transcript={transcription.transcript}
        error={transcription.error}
        onRetry={onRetryTranscription}
        onUseAnswer={onUseAnswer}
      />
    </div>
  )
}
