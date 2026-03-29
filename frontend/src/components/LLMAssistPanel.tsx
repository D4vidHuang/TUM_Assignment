/**
 * LLMAssistPanel — AI assist sidebar that appears when user selects a region.
 * Shows query input, sends to group's configured LLM, displays response.
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Props {
  caseId: number
  seriesName: string
  sliceIndex: number
  region: { x: number; y: number; w: number; h: number } | null
  groupId: number | null
  onClose: () => void
}

interface HistoryItem {
  id: number; user_name: string; query_text: string; response_text: string
  model_used: string; slice_index: number; latency_ms: number; created_at: string
}

export default function LLMAssistPanel({ caseId, seriesName, sliceIndex, region, groupId, onClose }: Props) {
  const [query, setQuery] = useState('Analyze this region and identify any abnormalities or findings.')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [latency, setLatency] = useState(0)

  useEffect(() => {
    api.getLLMHistory(caseId).then(setHistory).catch(() => {})
  }, [caseId, response])

  const handleSubmit = async () => {
    if (!groupId) {
      setError('No research group selected. AI assist requires group membership with a configured API.')
      return
    }
    setLoading(true)
    setError('')
    setResponse(null)
    try {
      const res = await api.llmAssist({
        group_id: groupId,
        case_id: caseId,
        series_name: seriesName,
        slice_index: sliceIndex,
        region: region,
        query: query,
      })
      setResponse(res.response)
      setLatency(res.latency_ms)
    } catch (err: any) {
      setError(err.message || 'Failed to get AI response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 56, right: 0, bottom: 0, width: 420,
      background: 'var(--gray-50, #f9fafb)', borderLeft: '1px solid var(--gray-200)',
      display: 'flex', flexDirection: 'column', zIndex: 200,
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--gray-200)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <h3 style={{ fontSize: 14, margin: 0 }}>AI Assistant</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowHistory(!showHistory)}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }}>
            {showHistory ? 'New Query' : 'History'}
          </button>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
        </div>
      </div>

      {showHistory ? (
        /* ── History view ──────────────────────── */
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {history.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No previous queries</p>
          ) : (
            history.map(h => (
              <div key={h.id} style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: 'var(--gray-100)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{h.user_name}</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 10 }}>
                    Slice {h.slice_index + 1} &middot; {h.latency_ms}ms
                  </span>
                </div>
                <div style={{ color: 'var(--primary)', marginBottom: 4 }}>Q: {h.query_text}</div>
                <div style={{ color: 'var(--gray-600)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{h.response_text}</div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Query view ───────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 10 }}>
          {/* Context info */}
          <div style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>Series: {seriesName}</span>
            <span>Slice: {sliceIndex + 1}</span>
            {region && <span style={{ color: 'var(--primary)' }}>Region selected</span>}
          </div>

          {/* Query input */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>Your Question</label>
            <textarea value={query} onChange={e => setQuery(e.target.value)}
              rows={3} style={{ fontSize: 12, resize: 'vertical' }}
              placeholder="Ask about findings, differential diagnosis, measurements..." />
          </div>

          {/* Quick prompts */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              'Identify abnormalities',
              'Differential diagnosis',
              'Is this a tumor?',
              'Measure the lesion',
              'Compare with normal',
            ].map(p => (
              <button key={p} onClick={() => setQuery(p)}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 12,
                  border: '1px solid var(--gray-200)', background: 'var(--gray-100)',
                  cursor: 'pointer', color: 'var(--gray-600)',
                }}>
                {p}
              </button>
            ))}
          </div>

          <button className="btn-primary" onClick={handleSubmit} disabled={loading || !query.trim()}
            style={{ padding: '8px 16px', fontSize: 12 }}>
            {loading ? 'Analyzing...' : 'Ask AI'}
          </button>

          {error && (
            <div style={{ background: '#fef2f2', color: 'var(--danger)', padding: 8, borderRadius: 6, fontSize: 12 }}>
              {error}
            </div>
          )}

          {/* Response */}
          {response && (
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--gray-100)', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>AI Analysis</span>
                <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{latency}ms</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--gray-700)' }}>
                {response}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
