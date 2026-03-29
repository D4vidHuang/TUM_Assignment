import { useState } from 'react'

interface Props {
  onLogin: (username: string, password: string) => Promise<void>
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(username, password)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-title">ClinEval</div>
        <div className="login-subtitle">Clinical Model Evaluation Platform</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: 12 }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="demo-accounts">
          <h4>Demo Accounts (click to fill)</h4>
          {[
            { u: 'admin', p: 'admin123', label: 'Admin', role: 'Administrator' },
            { u: 'dr.smith', p: 'password', label: 'Dr. Smith', role: 'Neuroradiology' },
            { u: 'dr.chen', p: 'password', label: 'Dr. Chen', role: 'Thoracic Radiology' },
            { u: 'dr.garcia', p: 'password', label: 'Dr. Garcia', role: 'Abdominal Radiology' },
          ].map((a) => (
            <div
              key={a.u}
              className="demo-account"
              style={{ cursor: 'pointer' }}
              onClick={() => quickLogin(a.u, a.p)}
            >
              <span><strong>{a.label}</strong> ({a.u})</span>
              <span>{a.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
