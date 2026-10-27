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

// Second gate: the container's magic bytes, not the client-declared MIME
// type alone (a multipart part header is client-controlled). Recognizes the
// same families the allowlist names: WebM/MKV (EBML), Ogg, MP4/M4A (ftyp),
// WAV (RIFF….WAVE) and MP3 (ID3 or frame sync).
export function sniffAllowedAudio(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true; // EBML
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true; // OggS
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // MPEG frame sync
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("ID3")) return true; // MP3 with metadata
  if (ascii.startsWith("RIFF") && ascii.slice(4, 8) === "WAVE") return true; // WAV
  if (ascii.slice(4, 8) === "ftyp") return true; // MP4/M4A
  return false;
}
