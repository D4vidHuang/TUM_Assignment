/**
 * QCDashboardPage — Quality Control dashboard with anomaly detection.
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Flag {
  type: string; severity: string; message: string; detail?: string
}
interface EvaluatorResult {
  user_id: number; full_name: string; evaluation_count: number
  avg_time_seconds: number; avg_rating: number | null; rating_std: number | null
  rating_distribution: Record<string, number>; error_flag_rate: number
  flags: Flag[]; flag_count: number; overall_quality: string
}
interface TimeEntry {
  evaluation_id: number; evaluator: string; case_title: string
  model_name: string; time_seconds: number; overall_rating: number; has_error: boolean
}

export default function QCDashboardPage() {
  const [overview, setOverview] = useState<any>(null)
  const [evaluators, setEvaluators] = useState<EvaluatorResult[]>([])
  const [timeDist, setTimeDist] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'evaluators' | 'timeline'>('overview')

  useEffect(() => {
    Promise.all([
      api.getQCOverview(),
      api.getQCEvaluatorAnalysis(),
      api.getQCTimeDistribution(),
    ]).then(([o, e, t]) => {
      setOverview(o); setEvaluators(e); setTimeDist(t)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading QC data...</div>

  const sevColor = (s: string) => s === 'high' ? '#ef4444' : s === 'medium' ? '#f59e0b' : '#6b7280'
  const qualColor = (q: string) => q === 'good' ? '#22c55e' : q === 'warning' ? '#f59e0b' : '#ef4444'

  // Simple histogram buckets
  const timeBuckets = [0, 10, 30, 60, 120, 300, 600]
  const timeHistogram = timeBuckets.map((min, i) => {
    const max = timeBuckets[i + 1] ?? Infinity
    const count = timeDist.filter(t => t.time_seconds >= min && t.time_seconds < max).length
    const label = max === Infinity ? `${min}s+` : `${min}-${max}s`
    return { label, count, min, max }
  })
  const maxCount = Math.max(1, ...timeHistogram.map(b => b.count))

  return (
    <div>
      <div className="page-header">
        <h1>Quality Control</h1>
        <p>Automated detection of anomalous evaluation behavior</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'evaluators' ? 'active' : ''}`} onClick={() => setTab('evaluators')}>Evaluator Analysis</button>
        <button className={`tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>Time Distribution</button>
      </div>

      {tab === 'overview' && overview && (
        <div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{overview.total_evaluations}</div>
              <div className="stat-label">Total Evaluations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{overview.avg_time_seconds}s</div>
              <div className="stat-label">Avg Time</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{overview.median_time_seconds}s</div>
              <div className="stat-label">Median Time</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{overview.critical_error_rate}%</div>
              <div className="stat-label">Critical Error Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{overview.minor_error_rate}%</div>
              <div className="stat-label">Minor Error Rate</div>
            </div>
          </div>

          {/* Rating distribution bar chart */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Rating Distribution</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
              {[1, 2, 3, 4, 5].map(r => {
                const dist = overview.rating_distribution || {}
                const count = dist[String(r)] || 0
                const vals = Object.values(dist) as number[]
                const maxR = Math.max(1, ...vals.length ? vals : [1])
                const pct = (count / maxR) * 100
                return (
                  <div key={r} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>{count}</span>
                    <div style={{ width: '100%', background: '#3b82f6', borderRadius: 4, height: `${Math.max(4, pct)}%`, transition: 'height 0.3s' }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'evaluators' && (
        <div>
          {evaluators.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>No evaluation data yet</div>
          ) : (
            evaluators.map(ev => (
              <div key={ev.user_id} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${qualColor(ev.overall_quality)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ev.full_name}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)' }}>
                      {ev.evaluation_count} evaluations
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                      background: `${qualColor(ev.overall_quality)}22`,
                      color: qualColor(ev.overall_quality),
                    }}>
                      {ev.overall_quality === 'good' ? 'PASS' : ev.overall_quality === 'warning' ? 'REVIEW' : 'ALERT'}
                    </span>
                    {ev.flag_count > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{ev.flag_count} flag(s)</span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span>Avg time: <strong>{ev.avg_time_seconds}s</strong></span>
                  <span>Avg rating: <strong>{ev.avg_rating ?? '-'}</strong></span>
                  <span>Std dev: <strong>{ev.rating_std ?? '-'}</strong></span>
                  <span>Error rate: <strong>{ev.error_flag_rate}%</strong></span>
                </div>

                {/* Mini rating histogram */}
                {ev.rating_distribution && Object.keys(ev.rating_distribution).length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginBottom: 8, alignItems: 'flex-end', height: 30 }}>
                    {[1, 2, 3, 4, 5].map(r => {
                      const c = ev.rating_distribution[String(r)] || 0
                      const vals = Object.values(ev.rating_distribution) as number[]
                      const mx = Math.max(1, ...vals.length ? vals : [1])
                      return (
                        <div key={r} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: '100%', height: `${(c / mx) * 24}px`, background: '#3b82f6', borderRadius: 2, minHeight: c > 0 ? 3 : 0 }} />
                          <span style={{ fontSize: 8, color: 'var(--gray-400)' }}>{r}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Flags */}
                {ev.flags.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ev.flags.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'start', gap: 8, padding: '4px 8px',
                        borderRadius: 4, background: `${sevColor(f.severity)}11`,
                        borderLeft: `3px solid ${sevColor(f.severity)}`,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sevColor(f.severity), textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          {f.severity}
                        </span>
                        <div>
                          <div style={{ fontSize: 12 }}>{f.message}</div>
                          {f.detail && <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{f.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div>
          {/* Time histogram */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Time Spent per Evaluation</h3>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 140 }}>
              {timeHistogram.map((b, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{b.count}</span>
                  <div style={{
                    width: '100%', borderRadius: 4,
                    height: `${(b.count / maxCount) * 100}px`,
                    background: b.min < 10 ? '#ef4444' : b.min < 30 ? '#f59e0b' : '#3b82f6',
                    minHeight: b.count > 0 ? 4 : 0,
                    transition: 'height 0.3s',
                  }} />
                  <span style={{ fontSize: 9, color: 'var(--gray-500)', textAlign: 'center' }}>{b.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 8, display: 'flex', gap: 12 }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#ef4444', borderRadius: 2 }} /> &lt;10s (suspicious)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#f59e0b', borderRadius: 2 }} /> 10-30s (quick)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3b82f6', borderRadius: 2 }} /> 30s+ (normal)</span>
            </div>
          </div>

          {/* Detailed table */}
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Evaluation Details</h3>
            <table>
              <thead>
                <tr>
                  <th style={{ fontSize: 11 }}>Evaluator</th>
                  <th style={{ fontSize: 11 }}>Case</th>
                  <th style={{ fontSize: 11 }}>Model</th>
                  <th style={{ fontSize: 11 }}>Time</th>
                  <th style={{ fontSize: 11 }}>Rating</th>
                  <th style={{ fontSize: 11 }}>Error?</th>
                </tr>
              </thead>
              <tbody>
                {timeDist.slice(0, 50).map(t => (
                  <tr key={t.evaluation_id}>
                    <td style={{ fontSize: 12 }}>{t.evaluator}</td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.case_title}</td>
                    <td style={{ fontSize: 11 }}>{t.model_name}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: t.time_seconds < 10 ? '#ef4444' : t.time_seconds < 30 ? '#f59e0b' : 'inherit' }}>
                      {t.time_seconds}s
                    </td>
                    <td style={{ fontSize: 12 }}>{t.overall_rating}</td>
                    <td style={{ fontSize: 11 }}>{t.has_error ? '⚠' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
