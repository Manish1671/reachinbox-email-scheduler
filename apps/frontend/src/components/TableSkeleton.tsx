export function TableSkeleton({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200" aria-busy="true" aria-label="Loading">
      <div className="divide-y divide-slate-200">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, column) => (
              <div key={column} className="h-4 animate-pulse rounded bg-slate-200" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
