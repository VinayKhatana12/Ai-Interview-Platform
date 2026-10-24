// Topic picker: toggle chips from the server's catalog. Selected chips are
// near-black (ink), not a brand hue, so colour stays on data.
export function TopicPicker({ topics, selected, onToggle, max = 5, error }) {
  const atMax = selected.length >= max
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink" id="topics-label">
        Topics
      </span>
      <div role="group" aria-labelledby="topics-label" aria-describedby={error ? 'topics-error' : 'topics-hint'} className="flex flex-wrap gap-2">
        {topics.map((topic) => {
          const isSelected = selected.includes(topic)
          const blocked = !isSelected && atMax
          return (
            <button
              key={topic}
              type="button"
              aria-pressed={isSelected}
              disabled={blocked}
              onClick={() => onToggle(topic)}
              className={`h-8 rounded-full border px-3.5 text-sm transition-colors ${
                isSelected
                  ? 'border-ink bg-ink text-white'
                  : blocked
                    ? 'cursor-not-allowed border-rule bg-surface text-muted/50'
                    : 'border-control bg-surface text-ink hover:bg-raised'
              }`}
            >
              {topic}
            </button>
          )
        })}
      </div>
      {error ? (
        <p id="topics-error" role="alert" className="text-xs text-negative">
          {error}
        </p>
      ) : (
        <p id="topics-hint" className="text-xs text-muted">
          {selected.length} of {max} selected
        </p>
      )}
    </div>
  )
}
