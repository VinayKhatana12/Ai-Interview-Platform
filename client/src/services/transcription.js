// Speech-to-text seam. The interface below is the contract the voice flow
// will call once the AI transcription provider connects in Phase 2.2:
//
//   recording stops -> transcribeRecording(blob) -> validated transcript
//   -> submitAnswer(...) to the existing Phase 1 backend
//
// Until then this throws; the voice UI shows a clearly-labeled prototype
// state and NEVER fabricates a transcript or submits anything.
export async function transcribeRecording(/* audioBlob */) {
  throw new Error('The transcription service connects in Phase 2.2.')
}
