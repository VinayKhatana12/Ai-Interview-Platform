// Live audio-level indicator. The bars carry the one data hue (#1d5fbf):
// this is the screen's live data element while recording.
const BAR_COUNT = 28

// Stable per-bar factors so the shape reads as a waveform, not static noise.
const FACTORS = Array.from({ length: BAR_COUNT }, (_, i) =>
  0.35 + 0.65 * Math.abs(Math.sin(i * 2.3999632)), // golden-angle hash, deterministic
)

export function AudioWaveform({ level, active }) {
  return (
    <div
      className="flex h-12 items-center justify-center gap-[3px]"
      role="img"
      aria-label={active ? 'Recording level indicator' : 'Audio level idle'}
    >
      {FACTORS.map((f, i) => {
        const h = active ? Math.max(3, Math.round(level * 46 * f) + 3) : 3
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`w-[3px] rounded-full transition-[height] duration-75 ${
              active ? 'bg-[#1d5fbf]' : 'bg-raised'
            }`}
            style={{ height: `${h}px` }}
          />
        )
      })}
    </div>
  )
}
