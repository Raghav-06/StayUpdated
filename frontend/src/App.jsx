import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import { Spinner } from './components/ui.jsx'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { AuthCallback, ForgotPassword, Signup } from './pages/AuthPages.jsx'
import { HistoryDetail, HistoryList } from './pages/HistoryPages.jsx'
import Home from './pages/Home.jsx'
import Following from './pages/Following.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'
import SharedSearch from './pages/SharedSearch.jsx'

function FullscreenSpinner() {
  return (
    <div className="fullscreen-center">
      <Spinner size={28} />
    </div>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullscreenSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

// Signed-in users have no reason to see the login or sign-up pages.
function GuestOnly() {
  const { user, loading } = useAuth()
  if (loading) return <FullscreenSpinner />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

function NotFound() {
  return (
    <div className="fullscreen-center">
      <h1 className="gradient-text big-404">404</h1>
      <p className="muted">This page doesn't exist.</p>
      <Link to="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/s/:shareId" element={<SharedSearch />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="/history" element={<HistoryList />} />
              <Route path="/history/:id" element={<HistoryDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/following" element={<Following />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
