import { createBrowserRouter, Navigate } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from './components/RouteGuards.jsx'
import AppShell from './components/AppShell.jsx'
import { PageSkeleton } from './components/Skeletons.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Landing from './pages/Landing.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Analytics from './pages/Analytics.jsx'
import NewInterview from './pages/NewInterview.jsx'
import InterviewSession from './pages/InterviewSession.jsx'
import Report from './pages/Report.jsx'
import History from './pages/History.jsx'
import Profile from './pages/Profile.jsx'

// The public home: guests get the landing page, signed-in candidates get
// their dashboard at the same address.
function PublicHome() {
  const { user, status } = useAuth()
  if (status === 'loading') return <PageSkeleton />
  if (user) {
    return (
      <AppShell>
        <Dashboard />
      </AppShell>
    )
  }
  return <Landing />
}

// A data router (not <BrowserRouter>) so the session screen can block
// navigation when an answer is unsaved.
export const router = createBrowserRouter([
  { path: '/', element: <PublicHome /> },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <Login />
      </GuestRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestRoute>
        <Register />
      </GuestRoute>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { path: '/interviews/new', element: <NewInterview /> },
      { path: '/interviews/:id', element: <InterviewSession /> },
      { path: '/interviews/:id/report', element: <Report /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/history', element: <History /> },
      { path: '/profile', element: <Profile /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
