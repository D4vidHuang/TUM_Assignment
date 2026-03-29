import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api, setToken, clearToken } from './api/client'
import LoginPage from './pages/LoginPage'
import CaseListPage from './pages/CaseListPage'
import EvaluatePage from './pages/EvaluatePage'
import PairwisePage from './pages/PairwisePage'
import AdminPage from './pages/AdminPage'
import AnnotationBrowserPage from './pages/AnnotationBrowserPage'
import GroupsPage from './pages/GroupsPage'
import ConferencePage from './pages/ConferencePage'
import QCDashboardPage from './pages/QCDashboardPage'
import Navbar from './components/Navbar'

export interface User {
  id: number
  username: string
  full_name: string
  role: string
  specialty?: string
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.getMe().then(setUser).catch(() => clearToken()).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = async (username: string, password: string) => {
    const res = await api.login(username, password)
    setToken(res.access_token)
    setUser(res.user)
  }

  const handleLogout = () => { clearToken(); setUser(null) }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
  if (!user) return <LoginPage onLogin={handleLogin} />

  return (
    <div className="app-layout">
      <Navbar user={user} onLogout={handleLogout} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
      <div className="main-content" style={{ padding: 0 }}>
        <Routes>
          <Route path="/" element={<div style={{ padding: 24 }}><CaseListPage /></div>} />
          <Route path="/case/:id" element={<EvaluatePage user={user} />} />
          <Route path="/case/:id/pairwise" element={<PairwisePage user={user} />} />
          <Route path="/conference/:confId" element={<ConferencePage user={user} />} />
          <Route path="/annotations" element={<div style={{ padding: 24 }}><AnnotationBrowserPage /></div>} />
          <Route path="/groups" element={<GroupsPage user={user} />} />
          {user.role === 'admin' && <Route path="/admin" element={<div style={{ padding: 24 }}><AdminPage /></div>} />}
          {user.role === 'admin' && <Route path="/qc" element={<div style={{ padding: 24 }}><QCDashboardPage /></div>} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}
