/**
 * EvaluatePage — Split-panel layout:
 *  Left: MultiSliceViewer with real imaging data + annotation
 *  Right: Model output tabs + evaluation form + findings
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import MultiSliceViewer from '../components/MultiSliceViewer'
import type { ImagingCase } from '../components/MultiSliceViewer'
import RatingInput from '../components/RatingInput'
import StructuredReportPanel from '../components/StructuredReportPanel'
import MPRViewer from '../components/MPRViewer'
import LLMAssistPanel from '../components/LLMAssistPanel'
import { useCollaboration } from '../hooks/useCollaboration'
import type { User } from '../App'

interface CaseOutput {
  id: number; model_name: string; output_text: string | null; image_url: string | null; display_order: number
}

interface CaseDetail {
  id: number; title: string; clinical_prompt: string; modality: string | null
  body_region: string | null; patient_age: string | null; patient_sex: string | null
  clinical_history: string | null; imaging_folder_name: string | null; outputs: CaseOutput[]
}

interface EvalForm {
  accuracy_rating: number | null; completeness_rating: number | null
  clarity_rating: number | null; overall_rating: number | null
  has_critical_error: boolean; has_minor_error: boolean; would_use_clinically: boolean | null
  error_description: string; corrections: string; comments: string
}

const emptyForm = (): EvalForm => ({
  accuracy_rating: null, completeness_rating: null, clarity_rating: null, overall_rating: null,
  has_critical_error: false, has_minor_error: false, would_use_clinically: null,
  error_description: '', corrections: '', comments: '',
})

export default function EvaluatePage({ user }: { user: User }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [imagingData, setImagingData] = useState<ImagingCase | null>(null)
  const [activeOutput, setActiveOutput] = useState(0)
  const [forms, setForms] = useState<Record<number, EvalForm>>({})
  const [submitted, setSubmitted] = useState<Record<number, number | boolean>>({})
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sliceAnnotations, setSliceAnnotations] = useState<any[]>([])
  const [activeSeries, setActiveSeries] = useState(0)
  const [sliceIndex, setSliceIndex] = useState(0)
  const startTime = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // MPR toggle
  const [showMPR, setShowMPR] = useState(false)

  // Annotation propagation
  const [lastAnnotationId, setLastAnnotationId] = useState<number | null>(null)

  // LLM assist
  const [showLLM, setShowLLM] = useState(false)
  const [userGroups, setUserGroups] = useState<any[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  // Collaboration
  const collab = useCollaboration(caseData?.id ?? null, user.full_name)

  // Live timer
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startTime.current) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load groups
  useEffect(() => {
    api.getGroups().then(g => {
      setUserGroups(g)
      if (g.length > 0) setSelectedGroupId(g[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const caseId = Number(id)
    Promise.all([
      api.getCase(caseId),
      api.getMyEvaluations(caseId),
      api.getCaseImaging(caseId),
    ]).then(([c, evals, img]) => {
      setCaseData(c)
      // Build imaging case structure
      if (img?.series?.length > 0 && img.imaging_folder_name) {
        setImagingData({ name: img.imaging_folder_name, series: img.series })
      }
      // Init forms
      const formsInit: Record<number, EvalForm> = {}
      const subInit: Record<number, boolean> = {}
      for (const out of c.outputs) {
        const existing = evals.find((e: any) => e.output_id === out.id)
        if (existing) {
          formsInit[out.id] = {
            accuracy_rating: existing.accuracy_rating, completeness_rating: existing.completeness_rating,
            clarity_rating: existing.clarity_rating, overall_rating: existing.overall_rating,
            has_critical_error: existing.has_critical_error, has_minor_error: existing.has_minor_error,
            would_use_clinically: existing.would_use_clinically,
            error_description: existing.error_description || '', corrections: existing.corrections || '', comments: existing.comments || '',
          }
          subInit[out.id] = true
        } else {
          formsInit[out.id] = emptyForm()
        }
      }
      setForms(formsInit); setSubmitted(subInit)
    }).finally(() => setLoading(false))
  }, [id])

  // Load annotations for current slice
  useEffect(() => {
    if (!caseData || !imagingData) return
    const series = imagingData.series[activeSeries]
    if (!series) return
    api.getSliceAnnotations(caseData.id, series.name, sliceIndex)
      .then(anns => {
        const shapes = anns.flatMap((a: any) => {
          try { return JSON.parse(a.annotation_data) } catch { return [] }
        })
        setSliceAnnotations(shapes)
      }).catch(() => {})
  }, [caseData, imagingData, activeSeries, sliceIndex])

  // Keyboard shortcuts — must be before any early returns (Rules of Hooks)
  const activeOutputRef = useRef(activeOutput)
  const caseDataRef = useRef(caseData)
  activeOutputRef.current = activeOutput
  caseDataRef.current = caseData

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const cd = caseDataRef.current
      if (!cd) return
      if (e.key >= '1' && e.key <= '5' && !e.ctrlKey) {
        setForms(prev => {
          const outId = cd.outputs[activeOutputRef.current]?.id
          if (!outId) return prev
          return { ...prev, [outId]: { ...(prev[outId] || emptyForm()), overall_rating: Number(e.key) } }
        })
      } else if (e.key === 'n' || e.key === 'N') {
        if (activeOutputRef.current < cd.outputs.length - 1) { setActiveOutput(p => p + 1); startTime.current = Date.now() }
      } else if (e.key === 'p' || e.key === 'P') {
        if (activeOutputRef.current > 0) { setActiveOutput(p => p - 1); startTime.current = Date.now() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (loading || !caseData) return <div style={{ padding: 40, color: 'var(--text-primary, #111)' }}>Loading case...</div>

  const currentOutput = caseData.outputs[activeOutput]
  const currentForm = forms[currentOutput?.id] || emptyForm()

  const updateForm = (field: keyof EvalForm, value: any) => {
    if (!currentOutput) return
    setForms(prev => ({ ...prev, [currentOutput.id]: { ...prev[currentOutput.id], [field]: value } }))
  }

  const handleSubmit = async () => {
    if (!currentOutput) return
    try {
      const evalResult = await api.submitEvaluation(caseData.id, {
        output_id: currentOutput.id, ...currentForm,
        time_spent_seconds: elapsed,
      })
      setSubmitted(prev => ({ ...prev, [currentOutput.id]: evalResult.id || true }))
      setSuccessMsg(`Evaluation saved for ${currentOutput.model_name}`)
      setTimeout(() => setSuccessMsg(''), 3000)
      if (activeOutput < caseData.outputs.length - 1) {
        setTimeout(() => { setActiveOutput(prev => prev + 1); startTime.current = Date.now() }, 500)
      }
    } catch (err: any) { alert('Error: ' + err.message) }
  }

  const handleAnnotationDraw = async (shapes: any[]) => {
    if (!caseData || !imagingData) return
    const series = imagingData.series[activeSeries]
    if (!series) return
    try {
      const result = await api.createAnnotation({
        case_id: caseData.id, series_name: series.name, slice_index: sliceIndex,
        annotation_data: JSON.stringify(shapes), label: '', finding_type: shapes[0]?.type || 'mixed',
        color: shapes[0]?.color || '#ff0000',
      })
      setLastAnnotationId(result.id)
      const anns = await api.getSliceAnnotations(caseData.id, series.name, sliceIndex)
      setSliceAnnotations(anns.flatMap((a: any) => { try { return JSON.parse(a.annotation_data) } catch { return [] } }))
    } catch (err: any) { console.error('Annotation save failed:', err) }
  }

  const handlePropagate = async (annotationId: number) => {
    try {
      const result = await api.propagateAnnotation({
        annotation_id: annotationId, direction: 'both', num_slices: 5, scale_factor: 0.95,
      })
      setSuccessMsg(`Annotation propagated to ${result.count} adjacent slices`)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err: any) { alert('Propagation failed: ' + err.message) }
  }

  // Get the current evaluation ID for structured reports
  const currentEvalId = submitted[currentOutput?.id]
    ? caseData.outputs.find(o => o.id === currentOutput?.id) ? (forms[currentOutput?.id] as any)?._evalId || null : null
    : null

  const allDone = caseData.outputs.every(o => submitted[o.id])
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'var(--card-bg, #fff)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/" style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>&larr; Cases</Link>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{caseData.title}</span>
          <span className={`badge badge-${caseData.modality?.toLowerCase() || ''}`} style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11 }}>
            {caseData.modality}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          {/* Collaboration toggle */}
          <button onClick={() => collab.setEnabled(!collab.enabled)}
            title={collab.enabled ? 'Collaboration ON' : 'Collaboration OFF'}
            style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', opacity: collab.enabled ? 1 : 0.4 }}>
            {collab.connected ? '🟢' : '👥'}
          </button>
          {collab.connected && collab.peers.size > 0 && (
            <span style={{ fontSize: 10, color: 'var(--success)' }}>{collab.peers.size} online</span>
          )}
          <button onClick={() => setShowMPR(!showMPR)}
            title="Toggle MPR (Multi-Planar Reconstruction)"
            style={{ background: showMPR ? '#8b5cf6' : 'none', color: showMPR ? '#fff' : 'var(--gray-500)', border: '1px solid var(--gray-200)', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
            🧊 MPR
          </button>
          <button onClick={() => setShowLLM(!showLLM)}
            style={{ background: showLLM ? '#2563eb' : 'none', color: showLLM ? '#fff' : 'var(--gray-500)', border: '1px solid var(--gray-200)', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
            🤖 AI
          </button>
          <span className="timer" title="Time elapsed">{fmtTime(elapsed)}</span>
          <Link to={`/case/${caseData.id}/pairwise`}>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>Pairwise</button>
          </Link>
        </div>
      </div>

      {successMsg && <div className="success-message" style={{ margin: '0 16px', marginTop: 4 }}>{successMsg}</div>}

      {/* Split panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── LEFT: Imaging Viewer + MPR ─────────────────────────── */}
        <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border, #e5e7eb)', overflow: 'hidden' }}>
          {imagingData ? (
            showMPR ? (
              <MPRViewer
                caseName={imagingData.name}
                seriesName={imagingData.series[activeSeries]?.name || imagingData.series[0]?.name}
                height={window.innerHeight - 105}
              />
            ) : (
              <MultiSliceViewer
                imagingCase={imagingData}
                height={window.innerHeight - 105}
                caseInfo={{ title: caseData.title, modality: caseData.modality || undefined, patient_age: caseData.patient_age || undefined, patient_sex: caseData.patient_sex || undefined }}
                enableAnnotation
                annotations={sliceAnnotations}
                onAnnotationDraw={handleAnnotationDraw}
                onAnnotationPropagate={handlePropagate}
                lastAnnotationId={lastAnnotationId}
                onSliceChange={setSliceIndex}
                onSeriesChange={setActiveSeries}
              />
            )
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#555' }}>
              No imaging data linked to this case
            </div>
          )}
        </div>

        {/* ── RIGHT: Evaluation Panel ──────────────────────────── */}
        <div style={{ flex: '0 0 45%', overflowY: 'auto', padding: 16, background: 'var(--panel-bg, #fafbff)' }}>
          {/* Clinical context (collapsible) */}
          <details open style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #374151)' }}>Clinical Context</summary>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6, color: 'var(--text-secondary, #4b5563)' }}>
              <p><strong>Prompt:</strong> {caseData.clinical_prompt}</p>
              {caseData.clinical_history && <p style={{ marginTop: 6 }}><strong>History:</strong> {caseData.clinical_history}</p>}
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-tertiary, #9ca3af)' }}>
                {caseData.patient_age && <span>Age: {caseData.patient_age}</span>}
                {caseData.patient_sex && <span>Sex: {caseData.patient_sex}</span>}
                {caseData.body_region && <span>Region: {caseData.body_region}</span>}
              </div>
            </div>
          </details>

          {/* Output tabs */}
          <div className="tabs" style={{ marginBottom: 12 }}>
            {caseData.outputs.map((o, i) => (
              <button key={o.id} className={`tab ${i === activeOutput ? 'active' : ''}`}
                onClick={() => { setActiveOutput(i); startTime.current = Date.now() }}
                style={{ fontSize: 12, padding: '6px 12px' }}>
                {o.model_name}{submitted[o.id] ? ' ✓' : ''}
              </button>
            ))}
          </div>

          {/* Model output text */}
          {currentOutput && (
            <div className="output-panel" style={{ marginBottom: 12 }}>
              <div className="output-header" style={{ padding: '8px 12px', fontSize: 12 }}>
                <span>{currentOutput.model_name}</span>
                <span style={{ color: 'var(--text-tertiary, #9ca3af)', fontSize: 11 }}>Output {activeOutput + 1}/{caseData.outputs.length}</span>
              </div>
              <div className="output-body" style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
                <div className="output-text" style={{ fontSize: 13, lineHeight: 1.65 }}>{currentOutput.output_text}</div>
              </div>
            </div>
          )}

          {/* Evaluation form */}
          <div className="eval-section" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, margin: 0 }}>Evaluation</h3>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary, #9ca3af)' }}>
                Keys: 1-5 rate · N/P nav · S submit
              </div>
            </div>

            <RatingInput label="Accuracy" value={currentForm.accuracy_rating} onChange={v => updateForm('accuracy_rating', v)} />
            <RatingInput label="Completeness" value={currentForm.completeness_rating} onChange={v => updateForm('completeness_rating', v)} />
            <RatingInput label="Clarity" value={currentForm.clarity_rating} onChange={v => updateForm('clarity_rating', v)} />
            <RatingInput label="Overall" value={currentForm.overall_rating} onChange={v => updateForm('overall_rating', v)} />

            <div style={{ margin: '10px 0', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label className="checkbox-label" style={{ fontSize: 12 }}>
                <input type="checkbox" checked={currentForm.has_critical_error} onChange={e => updateForm('has_critical_error', e.target.checked)} />
                Critical error
              </label>
              <label className="checkbox-label" style={{ fontSize: 12 }}>
                <input type="checkbox" checked={currentForm.has_minor_error} onChange={e => updateForm('has_minor_error', e.target.checked)} />
                Minor error
              </label>
              <label className="checkbox-label" style={{ fontSize: 12 }}>
                <input type="checkbox" checked={currentForm.would_use_clinically === true} onChange={e => updateForm('would_use_clinically', e.target.checked || null)} />
                Would use clinically
              </label>
            </div>

            {(currentForm.has_critical_error || currentForm.has_minor_error) && (
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Error description</label>
                <textarea rows={2} value={currentForm.error_description} onChange={e => updateForm('error_description', e.target.value)}
                  placeholder="Describe errors..." style={{ fontSize: 12 }} />
              </div>
            )}

            <div className="form-group">
              <label style={{ fontSize: 12 }}>Corrections</label>
              <textarea rows={2} value={currentForm.corrections} onChange={e => updateForm('corrections', e.target.value)}
                placeholder="How would you improve this?" style={{ fontSize: 12 }} />
            </div>

            <div className="form-group">
              <label style={{ fontSize: 12 }}>Comments</label>
              <textarea rows={2} value={currentForm.comments} onChange={e => updateForm('comments', e.target.value)}
                placeholder="Additional notes..." style={{ fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-primary" style={{ padding: '8px 20px', fontSize: 12 }} onClick={handleSubmit}
                disabled={!currentForm.overall_rating}>
                {submitted[currentOutput?.id] ? 'Update' : 'Submit'} (S)
              </button>
              {!currentForm.overall_rating && <span style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)' }}>Rate overall first</span>}
            </div>

            {/* Structured Reporting — always visible */}
            <StructuredReportPanel
              evaluationId={typeof submitted[currentOutput?.id] === 'number' ? (submitted[currentOutput?.id] as unknown as number) : null}
              modality={caseData.modality}
            />
          </div>

          {allDone && (
            <div className="card" style={{ marginTop: 12, textAlign: 'center', padding: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 13 }}>All outputs evaluated!</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => navigate('/')}>Back</button>
                <button className="btn-primary" onClick={() => navigate(`/case/${caseData.id}/pairwise`)}>Pairwise Compare</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LLM Assist Panel ──────────────────────── */}
      {showLLM && caseData && imagingData && (
        <LLMAssistPanel
          caseId={caseData.id}
          seriesName={imagingData.series[activeSeries]?.name || ''}
          sliceIndex={sliceIndex}
          region={null}
          groupId={selectedGroupId}
          onClose={() => setShowLLM(false)}
        />
      )}

      {/* ── Collaboration cursors overlay ──────────── */}
      {collab.enabled && collab.peers.size > 0 && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 150 }}>
          {Array.from(collab.peers.values()).map(peer => (
            peer.x !== undefined && peer.y !== undefined && (
              <div key={peer.user_id} style={{
                position: 'absolute',
                left: `${peer.x * 55}%`,
                top: `${peer.y * 100}%`,
                transition: 'left 0.1s, top 0.1s',
                pointerEvents: 'none',
              }}>
                {/* Cursor arrow */}
                <svg width="16" height="20" viewBox="0 0 16 20" fill={peer.color}>
                  <path d="M0 0L16 12L8 12L12 20L8 18L4 12L0 16Z" />
                </svg>
                {/* Name tag */}
                <span style={{
                  position: 'absolute', left: 16, top: 0,
                  background: peer.color, color: '#fff',
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  whiteSpace: 'nowrap', fontWeight: 600,
                }}>
                  {peer.name}
                </span>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
