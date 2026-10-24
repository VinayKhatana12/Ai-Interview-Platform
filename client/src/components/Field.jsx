// Accessible form field: label above the control (app-screens §8.1), inline
// error wired with aria-invalid + aria-describedby, optional hint text.
// Pass children to render a <select> instead of the text input.
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
  children,
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const controlClass = `h-10 rounded-[6px] border bg-surface px-3 text-base text-ink disabled:opacity-60 ${
    error ? 'border-negative' : 'border-control'
  } focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={controlClass}
        >
          {children}
        </select>
      ) : (
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
          className={`${controlClass} placeholder:text-muted/70`}
        />
      )}
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
