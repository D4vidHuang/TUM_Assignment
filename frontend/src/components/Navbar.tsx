import { Link, useLocation } from 'react-router-dom'
import type { User } from '../App'

interface Props {
  user: User
  onLogout: () => void
  darkMode: boolean
  onToggleDark: () => void
}

export default function Navbar({ user, onLogout, darkMode, onToggleDark }: Props) {
  const location = useLocation()

  const navLink = (to: string, label: string) => {
    const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
    return (
      <Link to={to} style={{
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--primary)' : 'var(--nav-link, #4b5563)',
        fontSize: 13, textDecoration: 'none',
      }}>
        {label}
      </Link>
    )
  }

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Link to="/" className="navbar-brand" style={{ textDecoration: 'none', fontSize: 16 }}>
          ClinEval
        </Link>
        <div style={{ display: 'flex', gap: 14 }}>
          {navLink('/', 'Cases')}
          {navLink('/annotations', 'Annotations')}
          {navLink('/groups', 'Groups')}
          {user.role === 'admin' && navLink('/admin', 'Admin')}
          {user.role === 'admin' && navLink('/qc', 'QC')}
        </div>
      </div>
      <div className="navbar-right">
        <button onClick={onToggleDark} title="Toggle dark mode"
          style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '4px 6px' }}>
          {darkMode ? '☀️' : '🌙'}
        </button>
        <span className="navbar-user" style={{ fontSize: 12 }}>
          {user.full_name}
        </span>
        <button className="btn-secondary" onClick={onLogout} style={{ padding: '4px 10px', fontSize: 11 }}>
          Logout
        </button>
      </div>
    </nav>
  )
}
