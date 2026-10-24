import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client.js'

// Session state for the whole app. On mount we ask the server who we are
// (GET /api/auth/me) so a page refresh restores the signed-in state; while
// that request is in flight, routes render their loading state.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready'

  useEffect(() => {
    let cancelled = false
    api('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (name, email, password) => {
    const data = await api('/api/auth/register', { method: 'POST', body: { name, email, password } })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const updateMe = useCallback(async (patch) => {
    const data = await api('/api/auth/me', { method: 'PATCH', body: patch })
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({ user, status, login, register, logout, updateMe }),
    [user, status, login, register, logout, updateMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
