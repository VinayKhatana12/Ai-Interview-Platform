import { createBrowserRouter, Navigate } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from './components/RouteGuards.jsx'
import AppShell from './components/AppShell.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewInterview from './pages/NewInterview.jsx'
import InterviewSession from './pages/InterviewSession.jsx'
import History from './pages/History.jsx'
import Profile from './pages/Profile.jsx'

// A data router (not <BrowserRouter>) so the session screen can block
// navigation when an answer is unsaved.
export const router = createBrowserRouter([
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
      { path: '/', element: <Dashboard /> },
      { path: '/interviews/new', element: <NewInterview /> },
      { path: '/interviews/:id', element: <InterviewSession /> },
      { path: '/history', element: <History /> },
      { path: '/profile', element: <Profile /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
