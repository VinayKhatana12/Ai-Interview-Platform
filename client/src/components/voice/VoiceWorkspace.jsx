import { AudioPlayer } from './AudioPlayer.jsx'
import { VoiceRecorder } from './VoiceRecorder.jsx'
import { TranscriptPanel } from './TranscriptPanel.jsx'

// Voice view of a question: listen, record, and see the explicit
// transcription pipeline. Playback uses browser speech synthesis and the
// pipeline is a labeled prototype; real typed submission (Phase 1 engine)
// stays available one toggle away.
export default function VoiceWorkspace({ question, recorder, onSwitchToTyped }) {
  const busy = ['recording', 'requesting', 'stopping'].includes(recorder.state)

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-line bg-surface px-5 py-5 sm:px-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Listen to the question</h3>
        <AudioPlayer text={question.text} disabled={busy} />
      </section>

      <section className="rounded-[8px] border border-line bg-surface px-5 py-6 sm:px-6">
        <h3 className="mb-4 text-sm font-medium text-ink">Record your answer</h3>
        <VoiceRecorder recorder={recorder} />
      </section>

      <TranscriptPanel
        recorderState={recorder.state}
        hasRecording={Boolean(recorder.recordingUrl)}
        recordingUrl={recorder.recordingUrl}
        onSwitchToTyped={onSwitchToTyped}
      />
    </div>
  )
}
