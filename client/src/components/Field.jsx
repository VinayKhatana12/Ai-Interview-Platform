// Accessible form field: label above the input (app-screens §8.1), inline
// error wired with aria-invalid + aria-describedby, optional hint text.
export function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  autoComplete,
  autoFocus = false,
  disabled = false,
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-10 rounded-[6px] border bg-surface px-3 text-base text-ink placeholder:text-muted/70 disabled:opacity-60 ${
          error ? 'border-negative' : 'border-control'
        } focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
