/**
 * AnnotationBrowserPage — Browse all saved annotations with thumbnail previews.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, sliceUrl } from '../api/client'

interface AnnotationItem {
  id: number; case_id: number; case_title: string; evaluator_name: string
  series_name: string; slice_index: number; source_type: string; model_name: string | null
  annotation_data: string; label: string | null; finding_type: string | null
  color: string; created_at: string
}

export default function AnnotationBrowserPage() {
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [caseFilter, setCaseFilter] = useState<number | ''>('')

  useEffect(() => {
    const params: any = {}
    if (caseFilter !== '') params.case_id = caseFilter
    api.getAnnotations(params).then(setAnnotations).finally(() => setLoading(false))
  }, [caseFilter])

  if (loading) return <div style={{ padding: 40 }}>Loading annotations...</div>

  // Get unique case IDs for filter
  const caseIds = [...new Set(annotations.map(a => a.case_id))]

  return (
    <div>
      <div className="page-header">
        <h1>Annotations</h1>
        <p>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''} saved</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Filter by case:</label>
        <select value={caseFilter} onChange={e => setCaseFilter(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ width: 250, padding: '6px 8px', fontSize: 13 }}>
          <option value="">All cases</option>
          {caseIds.map(id => {
            const ann = annotations.find(a => a.case_id === id)
            return <option key={id} value={id}>{ann?.case_title || `Case #${id}`}</option>
          })}
        </select>
      </div>

      {annotations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary, #9ca3af)' }}>
          <p>No annotations yet. Use the annotation tools in the evaluation viewer to create annotations.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {annotations.map(ann => {
            // Try to parse annotation shapes for display
            let shapes: any[] = []
            try { shapes = JSON.parse(ann.annotation_data) } catch { }
            const thumbUrl = sliceUrl(ann.case_title.includes('Fat') ? 'Fat embolism syndrome' : ann.case_title.includes('Renal') ? 'Renal cortical necrosis' : 'Uterus didelphys with longitudinal vaginal septum', ann.series_name, ann.slice_index)

            return (
              <div key={ann.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Thumbnail with annotation overlay */}
                <div style={{ position: 'relative', background: '#000', height: 180 }}>
                  <img src={thumbUrl} alt="Annotated slice"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  {/* Render annotation shapes */}
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    {shapes.map((shape: any, i: number) => {
                      const pts = shape.points || []
                      if (pts.length < 2) return null
                      const color = shape.color || ann.color
                      if (shape.type === 'rectangle') {
                        return <rect key={i}
                          x={`${Math.min(pts[0][0], pts[1][0]) * 100}%`}
                          y={`${Math.min(pts[0][1], pts[1][1]) * 100}%`}
                          width={`${Math.abs(pts[1][0] - pts[0][0]) * 100}%`}
                          height={`${Math.abs(pts[1][1] - pts[0][1]) * 100}%`}
                          fill="none" stroke={color} strokeWidth={2} />
                      }
                      if (shape.type === 'ellipse') {
                        return <ellipse key={i}
                          cx={`${(pts[0][0] + pts[1][0]) / 2 * 100}%`}
                          cy={`${(pts[0][1] + pts[1][1]) / 2 * 100}%`}
                          rx={`${Math.abs(pts[1][0] - pts[0][0]) / 2 * 100}%`}
                          ry={`${Math.abs(pts[1][1] - pts[0][1]) / 2 * 100}%`}
                          fill="none" stroke={color} strokeWidth={2} />
                      }
                      if (shape.type === 'arrow' || shape.type === 'ruler') {
                        return <line key={i}
                          x1={`${pts[0][0] * 100}%`} y1={`${pts[0][1] * 100}%`}
                          x2={`${pts[1][0] * 100}%`} y2={`${pts[1][1] * 100}%`}
                          stroke={color} strokeWidth={2} />
                      }
                      if (shape.type === 'freehand') {
                        const d = pts.map((p: number[], j: number) => `${j === 0 ? 'M' : 'L'}${p[0] * 100} ${p[1] * 100}`).join(' ')
                        return <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                      }
                      return null
                    })}
                  </svg>
                  {/* Type badge */}
                  <div style={{ position: 'absolute', top: 6, right: 6, background: ann.color, color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                    {ann.finding_type || 'annotation'}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    <Link to={`/case/${ann.case_id}`}>{ann.case_title}</Link>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{ann.series_name}</span>
                    <span>Slice {ann.slice_index + 1}</span>
                    <span>by {ann.evaluator_name}</span>
                  </div>
                  {ann.label && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-primary, #374151)' }}>{ann.label}</div>}
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary, #9ca3af)', marginTop: 4 }}>
                    {new Date(ann.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
