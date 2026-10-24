import { useCallback, useEffect, useState } from 'react'

// Minimal data-fetching hook: loading/error/data plus refetch for retry
// buttons. `fn` must be a stable reference (module-level api functions).
export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await fn())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  return { data, loading, error, refetch: run }
}
