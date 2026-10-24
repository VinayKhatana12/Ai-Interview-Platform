// Shared formatting. Numbers stay tabular via the .tnum class at render.
export function formatDateShort(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function scoreText(score) {
  return typeof score === 'number' ? score.toFixed(1) : '—'
}

export const EXPERIENCE_LABELS = {
  '0-1': '0–1 years (fresher)',
  '1-3': '1–3 years',
  '3-5': '3–5 years',
  '5+': '5+ years',
}
