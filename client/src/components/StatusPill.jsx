// Status pill: pale tint with dark text of the same hue (app-screens §7.6).
const STYLES = {
  PENDING: 'bg-raised text-[#3d3d3d]',
  IN_PROGRESS: 'bg-[#fffbeb] text-[#92400e]',
  COMPLETED: 'bg-[#dcfae5] text-[#04250e]',
}

const LABELS = {
  PENDING: 'Draft',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}

export function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex h-6 flex-none items-center rounded-full px-2.5 text-xs font-medium ${STYLES[status] ?? STYLES.PENDING}`}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
