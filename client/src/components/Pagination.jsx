// List footer: the range in words + prev/next (app-screens §7.8).
export function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between border-t border-rule px-5 py-3">
      <p className="text-xs text-muted tnum">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="h-8 rounded-[6px] border border-control bg-surface px-3 text-sm text-ink hover:bg-raised disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="h-8 rounded-[6px] border border-control bg-surface px-3 text-sm text-ink hover:bg-raised disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
