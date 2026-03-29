/**
 * PairwisePage — Side-by-side model comparison with synchronized viewers.
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, predictionSliceUrl, sliceUrl } from '../api/client'
import MultiSliceViewer from '../components/MultiSliceViewer'
import type { ImagingCase } from '../components/MultiSliceViewer'
import type { User } from '../App'

interface CaseOutput {
  id: number; model_name: string; output_text: string | null
  prediction_folder_name: string | null
}
interface CaseDetail {
  id: number; title: string; clinical_prompt: string; clinical_history: string | null
  imaging_folder_name: string | null; outputs: CaseOutput[]
}

export default function PairwisePage({ user }: { user: User }) {
  const { id } = useParams()
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [imagingData, setImagingData] = useState<ImagingCase | null>(null)
  const [pairIndex, setPairIndex] = useState(0)
  const [preferred, setPreferred] = useState<number | null>(null)
  const [strength, setStrength] = useState<number | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)

  // Synced viewer state
  const [syncSlice, setSyncSlice] = useState(0)
  const [syncSeries, setSyncSeries] = useState(0)

  const startTime = useRef(Date.now())

  useEffect(() => {
    const caseId = Number(id)
    Promise.all([api.getCase(caseId), api.getCaseImaging(caseId)])
      .then(([c, img]) => {
        setCaseData(c)
        if (img?.series?.length > 0 && img.imaging_folder_name) {
          setImagingData({ name: img.imaging_folder_name, series: img.series })
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading || !caseData) return <div style={{ padding: 40 }}>Loading...</div>

  const pairs: [CaseOutput, CaseOutput][] = []
  for (let i = 0; i < caseData.outputs.length; i++)
    for (let j = i + 1; j < caseData.outputs.length; j++)
      pairs.push([caseData.outputs[i], caseData.outputs[j]])

  if (pairs.length === 0) return (
    <div style={{ padding: 40 }}>
      <Link to={`/case/${caseData.id}`}>&larr; Back</Link>
      <p style={{ marginTop: 16 }}>Need at least 2 outputs for comparison.</p>
    </div>
  )

  const done = pairIndex >= pairs.length
  const [outputA, outputB] = !done ? pairs[pairIndex] : [null, null]

  const handleSubmit = async () => {
    if (!outputA || !outputB) return
    const elapsed = Math.round((Date.now() - startTime.current) / 1000)
    try {
      await api.submitPairwise(caseData.id, {
        output_a_id: outputA.id, output_b_id: outputB.id,
        preferred_id: preferred, preference_strength: strength,
        reasoning, time_spent_seconds: elapsed,
      })
      setSuccessMsg('Saved!')
      setTimeout(() => setSuccessMsg(''), 2000)
      if (pairIndex < pairs.length - 1) {
        setTimeout(() => {
          setPairIndex(p => p + 1)
          setPreferred(null); setStrength(null); setReasoning('')
          startTime.current = Date.now()
        }, 400)
      } else {
        setPairIndex(pairs.length)
      }
    } catch (err: any) { alert('Error: ' + err.message) }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Link to={`/case/${caseData.id}`} style={{ fontSize: 13 }}>&larr; Individual Evaluation</Link>
          <h2 style={{ fontSize: 18, margin: '4px 0 0' }}>Pairwise Comparison</h2>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary, #9ca3af)' }}>
          Pair {Math.min(pairIndex + 1, pairs.length)}/{pairs.length}
        </span>
      </div>

      {/* Clinical context */}
      <details style={{ marginBottom: 12, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Clinical Context</summary>
        <p style={{ marginTop: 4 }}>{caseData.clinical_prompt}</p>
        {caseData.clinical_history && <p style={{ marginTop: 4, color: 'var(--text-secondary, #6b7280)' }}>{caseData.clinical_history}</p>}
      </details>

      {successMsg && <div className="success-message">{successMsg}</div>}

      {done ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <h2>All pairs compared!</h2>
          <p style={{ color: 'var(--text-secondary, #6b7280)', marginTop: 8 }}>Thank you.</p>
          <Link to="/"><button className="btn-primary" style={{ marginTop: 12 }}>Back to Cases</button></Link>
        </div>
      ) : (
        <>
          {/* Side-by-side viewers (if imaging available) */}
          {imagingData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#3b82f6' }}>Output A: {outputA!.model_name}</div>
                <MultiSliceViewer imagingCase={imagingData} height={320} compact
                  controlledSliceIndex={syncSlice} onSliceChange={setSyncSlice}
                  controlledSeriesIndex={syncSeries} onSeriesChange={setSyncSeries} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#8b5cf6' }}>Output B: {outputB!.model_name}</div>
                <MultiSliceViewer imagingCase={imagingData} height={320} compact
                  controlledSliceIndex={syncSlice} onSliceChange={setSyncSlice}
                  controlledSeriesIndex={syncSeries} onSeriesChange={setSyncSeries} />
              </div>
            </div>
          )}

          {/* Side-by-side reports */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[outputA, outputB].map((output, idx) => (
              <div key={output!.id}
                className={`pairwise-output ${preferred === output!.id ? 'selected' : ''}`}
                onClick={() => setPreferred(output!.id)}>
                <div className="pairwise-label" style={{ fontSize: 13 }}>
                  {idx === 0 ? 'A' : 'B'}: {output!.model_name}
                </div>
                <div className="output-text" style={{ fontSize: 12, maxHeight: 250, overflow: 'auto' }}>
                  {output!.output_text}
                </div>
              </div>
            ))}
          </div>

          {/* Tie button */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-secondary"
              style={{ border: preferred === null ? '2px solid var(--primary)' : undefined, background: preferred === null ? 'var(--primary-light)' : undefined }}
              onClick={() => setPreferred(null)}>
              Tie (No Preference)
            </button>
          </div>

          {/* Strength */}
          {preferred !== null && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Preference strength:</div>
              <div className="preference-strength">
                {[{ v: 1, l: 'Slight' }, { v: 2, l: 'Moderate' }, { v: 3, l: 'Strong' }].map(s => (
                  <button key={s.v} className={`strength-btn ${strength === s.v ? 'active' : ''}`}
                    onClick={() => setStrength(s.v)}>{s.l}</button>
                ))}
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12 }}>Reasoning</label>
            <textarea rows={2} value={reasoning} onChange={e => setReasoning(e.target.value)}
              placeholder="Why do you prefer this output?" style={{ fontSize: 12 }} />
          </div>

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="btn-primary" style={{ padding: '10px 32px' }} onClick={handleSubmit}>Submit Comparison</button>
          </div>
        </>
      )}
    </div>
  )
}
