// One-line API-level error, shown near the action that caused it. Colour is
// a signal, not a texture (app-screens §11): one line, nothing louder.
export function FormError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-negative">
      {message}
    </p>
  )
}
