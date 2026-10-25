// Shared audio-format allowlist for transcription uploads: the formats the
// in-app recorder produces plus the other types both providers accept.
const ALLOWED_PREFIXES = [
  "audio/webm",
  "video/webm", // some engines label webm recordings this way
  "audio/mp4",
  "video/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/mpga",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/x-matroska",
];

export function isAllowedAudioType(mimeType) {
  const base = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return ALLOWED_PREFIXES.includes(base);
}
