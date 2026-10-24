// Segmented control: grey track, white active pill (app-screens §4.4).
// Disabled options keep their label and carry the reason in the hint.
export function SegmentedControl({ name, options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full rounded-[6px] bg-raised p-0.5">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={`h-8 rounded-[4px] px-3.5 text-sm transition-colors ${
              active
                ? 'bg-surface text-ink'
                : opt.disabled
                  ? 'cursor-not-allowed text-muted/50'
                  : 'text-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
