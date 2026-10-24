// Loading skeletons per app-screens §11: the final layout with each value
// replaced by a flat grey bar at its real size. No shimmer, no layout shift.
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-rule md:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2 bg-surface p-5">
          <div className="skeleton-bar h-3 w-20" />
          <div className="skeleton-bar h-7 w-14" />
        </div>
      ))}
    </div>
  )
}

export function RowsSkeleton({ rows = 4 }) {
  return (
    <div className="divide-y divide-rule" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3.5">
          <div className="flex-1 space-y-2">
            <div className="skeleton-bar h-4 w-40 max-w-full" />
            <div className="skeleton-bar h-3 w-56 max-w-full" />
          </div>
          <div className="skeleton-bar h-5 w-14" />
        </div>
      ))}
    </div>
  )
}

// Full-page hold while the session restores (same shape as RouteGuards).
export function PageSkeleton() {
  return (
    <div className="space-y-6 pt-8" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton-bar h-7 w-36" />
        <div className="skeleton-bar h-4 w-64 max-w-full" />
      </div>
      <KpiSkeleton />
      <div className="rounded-[8px] border border-line bg-surface">
        <div className="p-5"><div className="skeleton-bar h-4 w-40" /></div>
        <div className="px-5 pb-5"><RowsSkeleton rows={4} /></div>
      </div>
    </div>
  )
}
