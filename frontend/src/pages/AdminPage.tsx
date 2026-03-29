import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Stats {
  total_cases: number
  total_evaluations: number
  total_comparisons: number
  total_evaluators: number
  evaluations_per_case: number
  cases_fully_evaluated: number
  avg_time_per_evaluation: number | null
}

interface Annotator {
  evaluator_id: number
  full_name: string
  evaluations_count: number
  comparisons_count: number
  avg_overall_rating: number | null
  last_active: string | null
}

interface Agreement {
  case_id: number
  case_title: string
  num_evaluators: number
  mean_overall_rating: number | null
  std_overall_rating: number | null
  agreement_score: number | null
}

export default function AdminPage() {
  const [tab, setTab] = useState<'overview' | 'annotators' | 'agreement'>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [annotators, setAnnotators] = useState<Annotator[]>([])
  const [agreement, setAgreement] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getAdminStats(), api.getAnnotators(), api.getAgreement()])
      .then(([s, a, ag]) => { setStats(s); setAnnotators(a); setAgreement(ag) })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !stats) return <div style={{ padding: 40 }}>Loading dashboard...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <p>Monitor evaluation progress, annotator activity, and data quality</p>
      </div>

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <a href="/api/export/evaluations?format=csv" target="_blank">
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Export Evaluations (CSV)</button>
        </a>
        <a href="/api/export/comparisons?format=csv" target="_blank">
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Export Comparisons (CSV)</button>
        </a>
        <a href="/api/export/annotations?format=json" target="_blank">
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Export Annotations (JSON)</button>
        </a>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'annotators' ? 'active' : ''}`} onClick={() => setTab('annotators')}>Annotators</button>
        <button className={`tab ${tab === 'agreement' ? 'active' : ''}`} onClick={() => setTab('agreement')}>Agreement</button>
      </div>

      {tab === 'overview' && (
        <div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total_cases}</div>
              <div className="stat-label">Total Cases</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_evaluations}</div>
              <div className="stat-label">Total Evaluations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_comparisons}</div>
              <div className="stat-label">Pairwise Comparisons</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_evaluators}</div>
              <div className="stat-label">Active Evaluators</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.evaluations_per_case}</div>
              <div className="stat-label">Avg Evals / Case</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.cases_fully_evaluated}</div>
              <div className="stat-label">Fully Evaluated</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.avg_time_per_evaluation ? `${Math.round(stats.avg_time_per_evaluation)}s` : '-'}</div>
              <div className="stat-label">Avg Time / Eval</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Evaluation Progress</h3>
            <div style={{ background: 'var(--gray-100)', borderRadius: 8, height: 24, overflow: 'hidden' }}>
              <div
                style={{
                  background: 'var(--primary)',
                  height: '100%',
                  width: `${stats.total_cases > 0 ? (stats.cases_fully_evaluated / stats.total_cases) * 100 : 0}%`,
                  borderRadius: 8,
                  transition: 'width 0.5s',
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 8 }}>
              {stats.cases_fully_evaluated} of {stats.total_cases} cases fully evaluated
              ({stats.total_cases > 0 ? Math.round((stats.cases_fully_evaluated / stats.total_cases) * 100) : 0}%)
            </p>
          </div>
        </div>
      )}

      {tab === 'annotators' && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Annotator Activity</h3>
          <table>
            <thead>
              <tr>
                <th>Annotator</th>
                <th>Evaluations</th>
                <th>Comparisons</th>
                <th>Avg Rating</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {annotators.map((a) => (
                <tr key={a.evaluator_id}>
                  <td style={{ fontWeight: 500 }}>{a.full_name}</td>
                  <td>{a.evaluations_count}</td>
                  <td>{a.comparisons_count}</td>
                  <td>{a.avg_overall_rating ?? '-'}</td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                    {a.last_active ? new Date(a.last_active).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
              {annotators.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)' }}>No evaluations yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'agreement' && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Inter-Annotator Agreement</h3>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
            Agreement score is calculated from the standard deviation of overall ratings (1.0 = perfect agreement, 0.0 = maximum disagreement). Requires at least 2 evaluators per case.
          </p>
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Evaluators</th>
                <th>Mean Rating</th>
                <th>Std Dev</th>
                <th>Agreement</th>
              </tr>
            </thead>
            <tbody>
              {agreement.map((a) => (
                <tr key={a.case_id}>
                  <td style={{ fontWeight: 500 }}>{a.case_title}</td>
                  <td>{a.num_evaluators}</td>
                  <td>{a.mean_overall_rating ?? '-'}</td>
                  <td>{a.std_overall_rating ?? '-'}</td>
                  <td>
                    {a.agreement_score !== null ? (
                      <span style={{
                        color: a.agreement_score >= 0.7 ? 'var(--success)' : a.agreement_score >= 0.4 ? 'var(--warning)' : 'var(--danger)',
                        fontWeight: 600,
                      }}>
                        {a.agreement_score.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--gray-400)' }}>Needs 2+ raters</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
