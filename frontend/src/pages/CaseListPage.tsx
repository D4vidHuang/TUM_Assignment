import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

interface CaseItem {
  id: number
  title: string
  modality: string | null
  body_region: string | null
  num_outputs: number
  eval_status: string
}

interface Conference {
  id: string
  case_id: number
  title: string
  host_name: string
  participant_count: number
}

export default function CaseListPage() {
  const [cases, setCases] = useState<CaseItem[]>([])
  const [conferences, setConferences] = useState<Conference[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.getCases(), api.listConferences()])
      .then(([c, conf]) => { setCases(c); setConferences(conf) })
      .finally(() => setLoading(false))
  }, [])

  const startConference = async (caseItem: CaseItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const conf = await api.createConference({
        case_id: caseItem.id,
        title: `MDT: ${caseItem.title}`,
      })
      navigate(`/conference/${conf.id}`)
    } catch (err: any) {
      alert('Failed: ' + err.message)
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading cases...</div>

  const pending = cases.filter(c => c.eval_status === 'pending').length
  const completed = cases.filter(c => c.eval_status === 'completed').length

  return (
    <div>
      <div className="page-header">
        <h1>Evaluation Cases</h1>
        <p>
          {cases.length} cases total &middot; {completed} completed &middot; {pending} pending
        </p>
      </div>

      {/* Active conferences */}
      {conferences.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>Active Conferences</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {conferences.map(conf => (
              <button key={conf.id} onClick={() => navigate(`/conference/${conf.id}`)}
                style={{
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid #22c55e44', background: '#22c55e11',
                  color: 'var(--gray-700)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                <span style={{ fontWeight: 600 }}>{conf.title}</span>
                <span style={{ color: 'var(--gray-400)' }}>{conf.participant_count} online</span>
                <span style={{ color: 'var(--gray-400)' }}>by {conf.host_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="case-list">
        {cases.map((c) => (
          <div key={c.id} className="case-item" onClick={() => navigate(`/case/${c.id}`)}>
            <div className="case-item-left">
              <div className="case-item-title">{c.title}</div>
              <div className="case-item-meta">
                {c.modality && <span>{c.modality}</span>}
                {c.body_region && <span>{c.body_region}</span>}
                <span>{c.num_outputs} model output{c.num_outputs !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={(e) => startConference(c, e)}
                title="Start MDT consensus conference for this case"
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                  border: '1px solid var(--gray-200)', background: 'transparent',
                  color: 'var(--gray-500)',
                }}>
                📡 Conference
              </button>
              <span className={`badge badge-${c.eval_status.replace('_', '-')}`}>
                {c.eval_status === 'in_progress' ? 'In Progress' : c.eval_status.charAt(0).toUpperCase() + c.eval_status.slice(1)}
              </span>
              <span style={{ color: 'var(--gray-400)', fontSize: 20 }}>&rarr;</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
