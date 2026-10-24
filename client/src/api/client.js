// Thin fetch wrapper for the REST API. Same-origin through the Vite proxy in
// development, so the HttpOnly session cookie rides along automatically.
export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 'NETWORK', 0)
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(
      data?.error?.message ?? 'Something went wrong. Please try again.',
      data?.error?.code ?? 'UNKNOWN',
      res.status,
      data?.error?.details,
    )
  }
  return data
}
