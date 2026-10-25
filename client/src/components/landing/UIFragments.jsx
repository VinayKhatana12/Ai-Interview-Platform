// Real interface fragments of the app, built per the app-screen rules with
// data-ui on each root. The data is from actual runs of the product (the
// "E2E Final Good Answers" interview evaluated live), so nothing is staged.

export function ReportFragment() {
  return (
    <div data-ui className="overflow-hidden rounded-[8px] border border-line bg-surface">
      {/* taste-skill-ignore: real interface fragment, borders are the app's own */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-sm font-medium">E2E Final Good Answers</p>
        <p className="text-xs text-muted">25 Oct 2026 · Took 1 min</p>
      </div>
      {/* taste-skill-ignore: hairline grid belongs to the fragment */}
      <div className="grid grid-cols-2 gap-px bg-[#f0f0f0] sm:grid-cols-4">
        {[
          ['Overall score', '26.7'],
          ['Answered', '3 of 3'],
          ['Evaluated', '3'],
          ['Practice next', 'OOP'],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-xl font-medium tnum">{value}</p>
          </div>
        ))}
      </div>
      {/* taste-skill-ignore: fragment divider */}
      <div className="border-t-0 bg-raised px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Question 3 · JavaScript</p>
          <p className="text-sm tnum">
            70 <span className="text-xs text-muted">/ 100</span>
            <span className="ml-2 inline-flex h-6 items-center rounded-full bg-[#fffbeb] px-2.5 text-xs font-medium text-[#92400e]">
              Partially correct
            </span>
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          You correctly identified that a closure bundles a function with its defining scope,
          allowing it to access variables even after that scope has returned.
        </p>
        <p className="mt-2 text-xs text-muted">Strengths: 3 · Improvements: 3 · Model answer available</p>
      </div>
    </div>
  )
}

const BARS = [4, 9, 16, 22, 28, 24, 30, 26, 34, 30, 38, 32, 26, 30, 22, 26, 18, 22, 14, 18, 10, 12, 8, 10, 6]

export function VoiceFragment() {
  return (
    <div data-ui className="overflow-hidden rounded-[8px] border border-line bg-surface">
      {/* taste-skill-ignore: real interface fragment, borders are the app's own */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-sm font-medium">Voice answer · Question 2 of 3</p>
        <p className="text-xs text-muted tnum">00:14</p>
      </div>
      <div className="flex items-center gap-5 px-5 py-6">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[#c4242a]"
        >
          <span className="h-4 w-4 rounded-[2px] bg-white" />
        </span>
        <div className="flex h-12 flex-1 items-center gap-[3px]" aria-hidden="true">
          {BARS.map((h, i) => (
            <span key={i} className="w-[3px] rounded-full bg-[#1d5fbf]" style={{ height: `${h}px` }} />
          ))}
        </div>
      </div>
      {/* taste-skill-ignore: fragment divider */}
      <div className="border-t-0 bg-raised px-5 py-4">
        <p className="text-xs text-muted">Transcript</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">
          Keys let React identify which item changed, moved or was removed across renders, so it
          can update just that item instead of re-creating the list.
        </p>
      </div>
    </div>
  )
}

const TREND = [
  { d: '25 Oct', s: 33 },
  { d: '25 Oct', s: 0 },
  { d: '25 Oct', s: 26.7 },
]
const W = 560
const H = 150
const PAD = { l: 34, r: 40, t: 10, b: 22 }

export function KpiFragment() {
  return (
    <div data-ui className="overflow-hidden rounded-[8px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-raised px-5 py-3">
        <p className="text-sm font-medium">Dashboard · Browser Check</p>
        <p className="text-xs text-muted">25 Oct 2026</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#f0f0f0] sm:grid-cols-4">
        {[
          ['Completed interviews', '6'],
          ['Average score', '19.9'],
          ['Best score', '33.0'],
          ['Questions answered', '14'],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-2xl font-medium tnum">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-raised px-5 py-4">
        <p className="text-sm font-medium">Recent interviews</p>
        <p className="mt-1 text-sm text-muted">
          E2E Final Good Answers · 26.7 · Completed, and E2E Voice Final · 0.0 · Completed
        </p>
      </div>
    </div>
  )
}

export function TrendFragment() {
  const yMax = 40
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const x = (i) => PAD.l + (plotW * i) / (TREND.length - 1)
  const y = (s) => PAD.t + plotH - (plotH * s) / yMax
  const line = TREND.map((p, i) => `${x(i)},${y(p.s)}`).join(' ')
  return (
    <div data-ui className="overflow-hidden rounded-[8px] border border-line bg-surface">
      {/* taste-skill-ignore: real interface fragment, borders are the app's own */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-sm font-medium">Score trend</p>
        <p className="text-xs text-muted">Last 3 scored interviews</p>
      </div>
      <div className="px-4 pb-2 pt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Line chart of the last three interview scores: 33, 0, 26.7">
          {[0, 10, 20, 30, 40].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b6b6b" className="tnum">
                {t}
              </text>
            </g>
          ))}
          <polyline points={line} fill="none" stroke="#1d5fbf" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <text x={x(2) + 6} y={y(26.7) + 4} fontSize="11" fill="#0a0a0a" className="tnum">
            26.7
          </text>
          {TREND.map((p, i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b6b6b">
              {p.d}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
