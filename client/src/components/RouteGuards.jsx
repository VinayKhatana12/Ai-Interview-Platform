import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

// While the session is being restored from /me, hold the layout with grey
// bars at the size of what will appear (app-screens §11), with no redirect
// flicker.
function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Checking your session">
      <div className="w-72 space-y-3">
        <div className="skeleton-bar h-6 w-40" />
        <div className="skeleton-bar h-4 w-64" />
        <div className="skeleton-bar h-10 w-full" />
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <SessionLoading />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}

export function GuestRoute({ children }) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <SessionLoading />
  if (user) {
    const backTo = location.state?.from?.pathname || '/dashboard'
    return <Navigate to={backTo} replace />
  }
  return children
}
