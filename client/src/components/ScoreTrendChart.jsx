// Score trend: one line, drawn to the taste skill's chart rules (app-screens
// §6) — 3-5 faint horizontal gridlines with a real y-scale whose top tick
// sits above the maximum, 2px straight segments in the one data hue
// (#1d5fbf, reserved for the screen's main data element), no legend for a
// single series, flat date labels, and the end value labelled. Accessible
// via a summarizing aria-label; the exact numbers also live in the recent
// list below it.

const W = 640
const H = 190
const PAD = { top: 12, right: 44, bottom: 26, left: 40 }

function niceCeiling(max) {
  // Ticks in even 20s with the top tick above the highest score.
  return Math.max(40, Math.ceil((max * 1.05) / 20) * 20)
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function ScoreTrendChart({ points }) {
  const scored = points.filter((p) => typeof p.score === 'number')
  if (scored.length < 2) return null

  const yMax = niceCeiling(Math.max(...scored.map((p) => p.score)))
  const step = yMax / 4
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xAt = (i) => PAD.left + (plotW * i) / (scored.length - 1)
  const yAt = (score) => PAD.top + plotH - (plotH * score) / yMax

  const line = scored.map((p, i) => `${xAt(i)},${yAt(p.score)}`).join(' ')
  const last = scored[scored.length - 1]

  // Up to 5 flat x labels, first and last always included.
  const labelEvery = Math.max(1, Math.ceil((scored.length - 1) / 4))
  const xLabels = scored
    .map((p, i) => ({ i, at: i % labelEvery === 0 || i === scored.length - 1, p }))
    .filter((l) => l.at)

  const summary = `Line chart of ${scored.length} recent interview scores: ${scored
    .map((p) => `${p.score}`)
    .join(', ')}. Scale from 0 to ${yMax}.`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={summary}
      focusable="false"
    >
      {/* Gridlines + y ticks (4 even steps, top tick above the maximum) */}
      {[0, 1, 2, 3, 4].map((t) => {
        const y = yAt(t * step)
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="12" fill="#6b6b6b" className="tnum">
              {Math.round(t * step)}
            </text>
          </g>
        )
      })}

      {/* The one series, in the one data hue */}
      <polyline
        points={line}
        fill="none"
        stroke="#1d5fbf"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* End value label beside the last point */}
      <text
        x={xAt(scored.length - 1) + 6}
        y={yAt(last.score) + 4}
        fontSize="12"
        fill="#0a0a0a"
        className="tnum"
      >
        {last.score.toFixed(1)}
      </text>

      {/* Flat date labels */}
      {xLabels.map(({ i, p }) => (
        <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b6b6b">
          {shortDate(p.completedAt)}
        </text>
      ))}
    </svg>
  )
}
