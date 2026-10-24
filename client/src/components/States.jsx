// Empty state per app-screens §11: the section keeps its frame and heading;
// the message spans the block, and the first action sits where the data will
// appear. Dashed border marks an empty slot.
export function EmptyState({ message, action = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[8px] border border-dashed border-control px-6 py-12 text-center">
      <p className="text-sm text-muted">{message}</p>
      {action}
    </div>
  )
}

// Inline block error: one sentence + Retry, never a full-screen banner.
export function BlockError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-control px-6 py-12 text-center" role="alert">
      <p className="text-sm text-negative">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="h-8 rounded-[6px] border border-control bg-surface px-3 text-sm text-ink hover:bg-raised"
        >
          Retry
        </button>
      )}
    </div>
  )
}
