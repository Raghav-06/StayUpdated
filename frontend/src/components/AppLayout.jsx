import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { timeAgo } from '../lib/format.js'
import { FollowsProvider, useFollows } from '../lib/follows.jsx'
import { HistoryProvider, useHistory } from '../lib/history.jsx'
import { BellIcon, ClockIcon, CloseIcon, Logo, LogoutIcon, MenuIcon, PanelIcon, PlusIcon, SettingsIcon } from './icons.jsx'
import { Spinner } from './ui.jsx'

export function Avatar({ user }) {
  const initial = (user.name || user.email || '?').trim()[0].toUpperCase()
  return user.avatar_url ? (
    <img className="avatar" src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-fallback">{initial}</span>
  )
}

const COLLAPSED_KEY = 'su_sidebar_collapsed'

// Followed topics, each linking to its latest search. Hidden until the user follows something.
function FollowingSection() {
  const { follows } = useFollows()
  if (!follows.length) return null
  return (
    <div className="sidebar-section sidebar-following">
      <div className="sidebar-heading">
        <span>Following</span>
        <Link to="/following" className="link-subtle small">
          Manage
        </Link>
      </div>
      <nav className="history-list">
        {follows.map((f) => (
          <NavLink key={f.id} to={f.last_search_id ? `/history/${f.last_search_id}` : '/following'} end className="history-item following-item">
            <span className="history-topic">
              <BellIcon width={13} height={13} /> {f.topic}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Sidebar({ open, onClose, onCollapse }) {
  const { user, signOut } = useAuth()
  const { searches, loading } = useHistory()

  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/" className="brand">
            <Logo size={28} />
            <span>StayUpdated</span>
          </Link>
          <button className="icon-btn desktop-only" onClick={onCollapse} title="Close sidebar" aria-label="Close sidebar">
            <PanelIcon />
          </button>
          <button className="icon-btn mobile-only" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <Link to="/" className="btn btn-secondary btn-block new-search">
          <PlusIcon /> New search
        </Link>

        <FollowingSection />

        <div className="sidebar-section">
          <div className="sidebar-heading">
            <span>Recent</span>
            <Link to="/history" className="link-subtle small">
              View all
            </Link>
          </div>
          <nav className="history-list">
            {loading && (
              <div className="sidebar-empty">
                <Spinner size={16} />
              </div>
            )}
            {!loading && searches.length === 0 && (
              <p className="sidebar-empty muted small">Your searches will appear here.</p>
            )}
            {searches.map((s) => (
              <NavLink key={s.id} to={`/history/${s.id}`} className="history-item">
                <span className="history-topic">{s.topic}</span>
                <span className="history-meta">
                  <ClockIcon width={12} height={12} /> {timeAgo(s.created_at)}
                </span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-user">
          <NavLink to="/settings" className="sidebar-user-link" title="Account settings">
            <Avatar user={user} />
            <div className="sidebar-user-info">
              <strong>{user.name || user.email.split('@')[0]}</strong>
              <span className="muted small">{user.email}</span>
            </div>
            <SettingsIcon className="sidebar-user-gear" width={16} height={16} />
          </NavLink>
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogoutIcon />
          </button>
        </div>
      </aside>
    </>
  )
}

function Shell() {
  const location = useLocation()
  // The mobile menu remembers the page it was opened on, so it closes itself on navigation.
  const [menuOpenedAt, setMenuOpenedAt] = useState(null)
  const menuOpen = menuOpenedAt === location.key
  // On desktop the sidebar can be collapsed; the choice is remembered across visits.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable: preference lasts until reload */
    }
  }, [collapsed])

  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar open={menuOpen} onClose={() => setMenuOpenedAt(null)} onCollapse={() => setCollapsed(true)} />
      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMenuOpenedAt(location.key)} aria-label="Open menu">
            <MenuIcon />
          </button>
          <button
            className="icon-btn desktop-only"
            onClick={() => setCollapsed(false)}
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            <PanelIcon />
          </button>
          <Link to="/" className="brand">
            <Logo size={26} />
            <span>StayUpdated</span>
          </Link>
          <span style={{ width: 36 }} />
        </header>
        <Outlet />
      </div>
    </div>
  )
}

export default function AppLayout() {
  return (
    <HistoryProvider>
      <FollowsProvider>
        <Shell />
      </FollowsProvider>
    </HistoryProvider>
  )
}
