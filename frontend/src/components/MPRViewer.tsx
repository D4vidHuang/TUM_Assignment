/**
 * MPRViewer — Multi-Planar Reconstruction with axial/sagittal/coronal views.
 * Only enabled for series with ≥50 slices (CT-like thin-slice data).
 */
import { useState, useEffect, useCallback } from 'react'
import { api, mprUrl } from '../api/client'

interface Props {
  caseName: string
  seriesName: string
  height?: number
}

const PLANES = [
  { key: 'axial', label: 'Axial', color: '#3b82f6' },
  { key: 'sagittal', label: 'Sagittal', color: '#22c55e' },
  { key: 'coronal', label: 'Coronal', color: '#f59e0b' },
] as const

export default function MPRViewer({ caseName, seriesName, height = 500 }: Props) {
  const [info, setInfo] = useState<any>(null)
  const [indices, setIndices] = useState({ axial: 0, sagittal: 0, coronal: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMPRInfo(caseName, seriesName).then(d => {
      setInfo(d)
      setIndices({
        axial: Math.floor(d.axial_count / 2),
        sagittal: Math.floor(d.width / 2),
        coronal: Math.floor(d.height / 2),
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [caseName, seriesName])

  const handleWheel = useCallback((plane: string, e: React.WheelEvent) => {
    e.stopPropagation()
    if (!info) return
    const delta = e.deltaY > 0 ? 1 : -1
    setIndices(prev => {
      const max = plane === 'axial' ? info.axial_count - 1
        : plane === 'sagittal' ? info.width - 1
        : info.height - 1
      return { ...prev, [plane]: Math.max(0, Math.min(max, prev[plane as keyof typeof prev] + delta)) }
    })
  }, [info])

  if (loading) return <div style={{ padding: 20, color: '#666', textAlign: 'center' }}>Loading MPR data...</div>
  if (!info) return <div style={{ padding: 20, color: '#666', textAlign: 'center' }}>MPR data not available</div>

  // If not enough slices, show warning + axial-only view
  if (!info.mpr_feasible) {
    return (
      <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden', padding: 4, height }}>
        <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 600 }}>MPR — Multi-Planar Reconstruction</span>
          <span style={{ color: '#6b7280', fontSize: 10 }}>{seriesName}</span>
        </div>
        <div style={{
          margin: '8px 12px', padding: '12px 16px', borderRadius: 6,
          background: '#1c1917', border: '1px solid #f59e0b44', color: '#fbbf24', fontSize: 12,
        }}>
          <strong>Low Z-Resolution:</strong> {info.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: height - 120, padding: 12 }}>
          <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: '1px solid #3b82f633' }}>
            <img src={mprUrl(caseName, seriesName, 'axial', indices.axial)}
              alt={`Axial ${indices.axial}`}
              style={{ maxHeight: height - 150, objectFit: 'contain', display: 'block' }}
              onWheel={e => handleWheel('axial', e)} />
            <div style={{ position: 'absolute', top: 4, left: 6, color: '#3b82f6', fontSize: 11, fontWeight: 700 }}>Axial</div>
            <div style={{ position: 'absolute', top: 4, right: 6, color: '#aaa', fontSize: 10 }}>{indices.axial + 1}/{info.axial_count}</div>
          </div>
        </div>
        <div style={{ padding: '0 12px 4px', textAlign: 'center' }}>
          <input type="range" min={0} max={info.axial_count - 1} value={indices.axial}
            onChange={e => setIndices(p => ({ ...p, axial: Number(e.target.value) }))}
            style={{ width: 300, accentColor: '#3b82f6' }} />
        </div>
      </div>
    )
  }

  // Full MPR — 3 panels
  const panelH = height - 40

  return (
    <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden', padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
        <span style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 600 }}>MPR — Multi-Planar Reconstruction</span>
        <span style={{ color: '#6b7280', fontSize: 10 }}>{seriesName} &middot; {info.axial_count} slices</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, height: panelH }}>
        {PLANES.map(({ key, label, color }) => {
          const idx = indices[key as keyof typeof indices]
          const max = key === 'axial' ? info.axial_count - 1
            : key === 'sagittal' ? info.width - 1
            : info.height - 1

          return (
            <div key={key}
              onWheel={e => handleWheel(key, e)}
              style={{
                position: 'relative', background: '#0a0a0a', borderRadius: 4, overflow: 'hidden',
                border: `1px solid ${color}33`, cursor: 'ns-resize',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <img
                src={mprUrl(caseName, seriesName, key, idx)}
                alt={`${label} ${idx}`}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
              />

              {/* Crosshairs */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `1px dashed ${key === 'axial' ? '#f59e0b' : '#3b82f6'}44` }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: `1px dashed ${key === 'axial' ? '#22c55e' : '#f59e0b'}44` }} />
              </div>

              {/* Labels */}
              <div style={{ position: 'absolute', top: 4, left: 6, color, fontSize: 11, fontWeight: 700, textShadow: '0 1px 3px #000' }}>{label}</div>
              <div style={{ position: 'absolute', top: 4, right: 6, color: '#aaa', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}/{max + 1}</div>

              {/* Orientation markers */}
              {key === 'axial' && <>
                <span style={{ position: 'absolute', top: '50%', left: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>R</span>
                <span style={{ position: 'absolute', top: '50%', right: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>L</span>
                <span style={{ position: 'absolute', top: 18, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>A</span>
                <span style={{ position: 'absolute', bottom: 20, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>P</span>
              </>}
              {key === 'sagittal' && <>
                <span style={{ position: 'absolute', top: '50%', left: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>A</span>
                <span style={{ position: 'absolute', top: '50%', right: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>P</span>
                <span style={{ position: 'absolute', top: 18, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>S</span>
                <span style={{ position: 'absolute', bottom: 20, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>I</span>
              </>}
              {key === 'coronal' && <>
                <span style={{ position: 'absolute', top: '50%', left: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>R</span>
                <span style={{ position: 'absolute', top: '50%', right: 2, color: '#444', fontSize: 9, transform: 'translateY(-50%)' }}>L</span>
                <span style={{ position: 'absolute', top: 18, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>S</span>
                <span style={{ position: 'absolute', bottom: 20, left: '50%', color: '#444', fontSize: 9, transform: 'translateX(-50%)' }}>I</span>
              </>}

              {/* Slider */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                <input type="range" min={0} max={max} value={idx}
                  onChange={e => setIndices(p => ({ ...p, [key]: Number(e.target.value) }))}
                  style={{ width: '100%', height: 3, accentColor: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
