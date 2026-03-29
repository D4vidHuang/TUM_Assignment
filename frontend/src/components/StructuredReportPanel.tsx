/**
 * StructuredReportPanel — BI-RADS / LI-RADS / Lung-RADS / PI-RADS
 * standardized evaluation form with category selection and structured fields.
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface Category {
  value: string; label: string; description: string; color: string
}
interface Field {
  key: string; label: string; type: string; options?: string[]
}
interface Template {
  name: string; full_name: string; modalities: string[]
  categories: Category[]; fields: Field[]
}

interface Props {
  evaluationId: number | null
  modality: string | null
  onReportSaved?: () => void
}

export default function StructuredReportPanel({ evaluationId, modality, onReportSaved }: Props) {
  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [modelCategory, setModelCategory] = useState<string>('')
  const [agrees, setAgrees] = useState<boolean | null>(null)
  const [override, setOverride] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getReportTemplates().then(t => {
      setTemplates(t)
      // Auto-select template based on modality
      if (modality) {
        const match = Object.entries(t).find(([_, v]) =>
          (v as Template).modalities.some(m => m.toLowerCase() === modality.toLowerCase())
        )
        if (match) setSelectedTemplate(match[0])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [modality])

  // Load existing report
  useEffect(() => {
    if (!evaluationId) return
    api.getEvaluationReport(evaluationId).then(r => {
      if (r) {
        setSelectedTemplate(r.template_type)
        setCategory(r.category || '')
        setModelCategory(r.model_category || '')
        setAgrees(r.category_agrees)
        setOverride(r.category_override || '')
        setNotes(r.notes || '')
        if (r.structured_data) {
          try { setFieldValues(JSON.parse(r.structured_data)) } catch {}
        }
      }
    }).catch(() => {})
  }, [evaluationId])

  const template = templates[selectedTemplate]

  const handleSave = async () => {
    if (!evaluationId || !selectedTemplate || !category) return
    const catInfo = template?.categories.find(c => c.value === category)
    try {
      await api.createReport({
        evaluation_id: evaluationId,
        template_type: selectedTemplate,
        category,
        category_label: catInfo?.label || '',
        structured_data: JSON.stringify(fieldValues),
        model_category: modelCategory || null,
        category_agrees: agrees,
        category_override: override || null,
        notes: notes || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onReportSaved?.()
    } catch (err: any) {
      alert('Error saving report: ' + err.message)
    }
  }

  if (loading) return null

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 6, padding: 12, marginTop: 12, background: 'var(--gray-50, #f9fafb)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>📋</span> Structured Report
        </h4>
        {saved && <span style={{ fontSize: 11, color: 'var(--success)' }}>Saved!</span>}
      </div>

      {/* Template selector */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 500 }}>Reporting System</label>
        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
          {Object.entries(templates).map(([key, t]) => (
            <button key={key} onClick={() => { setSelectedTemplate(key); setCategory(''); setFieldValues({}) }}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                border: selectedTemplate === key ? '2px solid var(--primary)' : '1px solid var(--gray-200)',
                background: selectedTemplate === key ? 'var(--primary-light, #dbeafe)' : 'transparent',
                color: selectedTemplate === key ? 'var(--primary)' : 'var(--gray-600)',
                fontWeight: selectedTemplate === key ? 700 : 400,
              }}>
              {key}
            </button>
          ))}
        </div>
      </div>

      {template && (
        <>
          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginBottom: 10 }}>{template.full_name}</div>

          {/* Category selection — the core classification */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, display: 'block' }}>Classification Category</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {template.categories.map(cat => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                    border: category === cat.value ? `2px solid ${cat.color}` : '1px solid var(--gray-200)',
                    background: category === cat.value ? `${cat.color}15` : 'transparent',
                    transition: 'all 0.1s',
                  }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', background: cat.color,
                    flexShrink: 0, border: category === cat.value ? '2px solid #fff' : 'none',
                    boxShadow: category === cat.value ? `0 0 0 1px ${cat.color}` : 'none',
                  }} />
                  <span style={{ fontSize: 12, fontWeight: category === cat.value ? 700 : 500 }}>
                    {cat.value} — {cat.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto' }}>{cat.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template-specific fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {template.fields.map(field => (
              <div key={field.key}>
                <label style={{ fontSize: 10, fontWeight: 500, display: 'block', marginBottom: 2 }}>{field.label}</label>
                {field.type === 'select' ? (
                  <select value={fieldValues[field.key] || ''} onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                    style={{ fontSize: 11, padding: '4px 6px' }}>
                    <option value="">—</option>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="number" value={fieldValues[field.key] || ''} onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                    style={{ fontSize: 11, padding: '4px 6px' }} />
                )}
              </div>
            ))}
          </div>

          {/* Model agreement */}
          <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 4 }}>Model Assessment</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 10 }}>Model's category</label>
                <select value={modelCategory} onChange={e => setModelCategory(e.target.value)} style={{ fontSize: 11, padding: '3px 6px' }}>
                  <option value="">—</option>
                  {template.categories.map(c => <option key={c.value} value={c.value}>{c.value} — {c.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label className="checkbox-label" style={{ fontSize: 11 }}>
                  <input type="checkbox" checked={agrees === true} onChange={() => setAgrees(agrees === true ? null : true)} /> Agree
                </label>
                <label className="checkbox-label" style={{ fontSize: 11 }}>
                  <input type="checkbox" checked={agrees === false} onChange={() => setAgrees(agrees === false ? null : false)} /> Disagree
                </label>
              </div>
              {agrees === false && (
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 10 }}>Corrected category</label>
                  <select value={override} onChange={e => setOverride(e.target.value)} style={{ fontSize: 11, padding: '3px 6px' }}>
                    <option value="">—</option>
                    {template.categories.map(c => <option key={c.value} value={c.value}>{c.value} — {c.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10 }}>Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Additional observations..." style={{ fontSize: 11 }} />
          </div>

          <button className="btn-primary" onClick={handleSave} disabled={!category || !evaluationId}
            style={{ fontSize: 11, padding: '6px 14px' }}>
            Save Structured Report
          </button>
        </>
      )}
    </div>
  )
}
