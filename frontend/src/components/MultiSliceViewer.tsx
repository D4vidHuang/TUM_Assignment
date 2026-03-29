/**
 * MultiSliceViewer — Professional radiology image viewer.
 *
 * Canvas-based with:
 *  - Scroll-wheel slice navigation
 *  - Window/Level (right-click drag) with presets
 *  - Zoom (Ctrl+scroll) and Pan (middle-click drag)
 *  - Cine mode (auto-play)
 *  - DICOM-style metadata overlay
 *  - Annotation overlay with lasso tool
 *  - Synchronized controlled mode for comparison
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { sliceUrl, heatmapUrl } from '../api/client'

export interface Series {
  name: string
  slice_count: number
}

export interface ImagingCase {
  name: string
  series: Series[]
}

interface Props {
  imagingCase: ImagingCase
  urlBuilder?: (caseName: string, seriesName: string, index: number) => string
  controlledSliceIndex?: number
  onSliceChange?: (index: number) => void
  controlledSeriesIndex?: number
  onSeriesChange?: (index: number) => void
  compact?: boolean
  caseInfo?: { title?: string; modality?: string; patient_age?: string; patient_sex?: string }
  height?: number
  enableAnnotation?: boolean
  onAnnotationDraw?: (shapes: any[]) => void
  onAnnotationPropagate?: (annotationId: number) => void
  annotations?: any[]
  /** Heatmap overlay model name (e.g. "attention-v1"). Set to show heatmap blend. */
  heatmapModel?: string | null
  heatmapOpacity?: number
  /** Last saved annotation ID for propagation */
  lastAnnotationId?: number | null
}

const PRELOAD = 8

const WL_PRESETS: Record<string, [number, number]> = {
  'Soft Tissue': [400, 40],
  'Lung': [1500, -600],
  'Bone': [2000, 400],
  'Brain': [80, 40],
  'Default': [0, 0],
}

export default function MultiSliceViewer({
  imagingCase, urlBuilder, controlledSliceIndex, onSliceChange,
  controlledSeriesIndex, onSeriesChange, compact, caseInfo, height = 560,
  enableAnnotation, onAnnotationDraw, onAnnotationPropagate, annotations,
  heatmapModel, heatmapOpacity = 0.4, lastAnnotationId,
}: Props) {
  const [activeSeries, setActiveSeries] = useState(controlledSeriesIndex ?? 0)
  const [sliceIndex, setSliceIndex] = useState(0)
  const [sliceCount, setSliceCount] = useState(1)

  const [windowWidth, setWindowWidth] = useState(0)
  const [windowCenter, setWindowCenter] = useState(0)
  const [wlActive, setWlActive] = useState(false)
  const [activePreset, setActivePreset] = useState('Default')

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const [cineActive, setCineActive] = useState(false)
  const [cineFps, setCineFps] = useState(8)

  const [annotMode, setAnnotMode] = useState(false)
  const [drawingShape, setDrawingShape] = useState<any>(null)
  const [currentTool, setCurrentTool] = useState<string>('rectangle')
  const [drawColor, setDrawColor] = useState('#ff0000')

  const [showHeatmap, setShowHeatmap] = useState(!!heatmapModel)
  const [hmOpacity, setHmOpacity] = useState(heatmapOpacity)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageWrapRef = useRef<HTMLDivElement>(null)
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const fracIndex = useRef(0)
  const wlStart = useRef({ w: 0, c: 0, x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  const buildUrl = urlBuilder || sliceUrl
  const series = imagingCase.series[activeSeries]

  useEffect(() => {
    if (controlledSliceIndex !== undefined) setSliceIndex(controlledSliceIndex)
  }, [controlledSliceIndex])

  useEffect(() => {
    if (controlledSeriesIndex !== undefined) setActiveSeries(controlledSeriesIndex)
  }, [controlledSeriesIndex])

  useEffect(() => {
    const s = imagingCase.series[activeSeries]
    if (!s) return
    setSliceCount(s.slice_count)
    const mid = Math.floor(s.slice_count / 2)
    setSliceIndex(mid)
    fracIndex.current = mid
    imageCache.current.clear()
  }, [activeSeries, imagingCase])

  const preload = useCallback((idx: number) => {
    if (!series) return
    for (let i = Math.max(0, idx - PRELOAD); i <= Math.min(sliceCount - 1, idx + PRELOAD); i++) {
      const url = buildUrl(imagingCase.name, series.name, i)
      if (!imageCache.current.has(url)) {
        const img = new Image()
        img.src = url
        imageCache.current.set(url, img)
      }
    }
  }, [series, sliceCount, imagingCase.name, buildUrl])

  const goToSlice = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(sliceCount - 1, Math.round(idx)))
    fracIndex.current = clamped
    setSliceIndex(clamped)
    onSliceChange?.(clamped)
    preload(clamped)
  }, [sliceCount, onSliceChange, preload])

  // ── Canvas rendering ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!series) return
    const url = buildUrl(imagingCase.name, series.name, sliceIndex)
    let img = imageCache.current.get(url)

    const draw = (image: HTMLImageElement) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(image, 0, 0)
      if (windowWidth !== 0 || windowCenter !== 0) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const d = imageData.data
        const lower = windowCenter - windowWidth / 2
        const upper = windowCenter + windowWidth / 2
        for (let i = 0; i < d.length; i += 4) {
          let val = ((d[i] - lower) / (upper - lower)) * 255
          val = Math.max(0, Math.min(255, val))
          d[i] = d[i + 1] = d[i + 2] = val
        }
        ctx.putImageData(imageData, 0, 0)
      }
    }

    if (img && img.complete && img.naturalWidth > 0) {
      draw(img)
    } else {
      img = new Image()
      img.onload = () => { imageCache.current.set(url, img!); draw(img!) }
      img.src = url
    }
    preload(sliceIndex)
  }, [sliceIndex, series, imagingCase.name, buildUrl, windowWidth, windowCenter, preload])

  // ── Heatmap overlay rendering ────────────────────────────────────────────
  useEffect(() => {
    const hmCanvas = heatmapCanvasRef.current
    if (!hmCanvas) return
    if (!showHeatmap || !heatmapModel || !series) {
      hmCanvas.width = 0; hmCanvas.height = 0; return
    }
    const url = heatmapUrl(heatmapModel, imagingCase.name, series.name, sliceIndex)
    const img = new Image()
    img.onload = () => {
      hmCanvas.width = img.naturalWidth
      hmCanvas.height = img.naturalHeight
      const ctx = hmCanvas.getContext('2d')
      if (!ctx) return
      ctx.globalAlpha = hmOpacity
      ctx.drawImage(img, 0, 0)
    }
    img.onerror = () => { hmCanvas.width = 0; hmCanvas.height = 0 }
    img.src = url
  }, [sliceIndex, series, imagingCase.name, heatmapModel, showHeatmap, hmOpacity])

  // ── Cine ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cineActive) return
    const interval = setInterval(() => {
      setSliceIndex(prev => {
        const next = prev >= sliceCount - 1 ? 0 : prev + 1
        fracIndex.current = next
        onSliceChange?.(next)
        return next
      })
    }, 1000 / cineFps)
    return () => clearInterval(interval)
  }, [cineActive, cineFps, sliceCount, onSliceChange])

  // ── Wheel ────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      setZoom(z => Math.max(0.5, Math.min(10, z * (e.deltaY > 0 ? 0.9 : 1.1))))
    } else {
      goToSlice(Math.round(fracIndex.current + e.deltaY / 100))
    }
  }, [goToSlice])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Annotation coordinate helpers ────────────────────────────────────────
  // Get normalized coordinates (0-1) relative to the canvas element,
  // accounting for zoom and pan transforms
  const getNormalizedCoords = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    // getBoundingClientRect includes CSS transforms (zoom/pan)
    const rect = canvas.getBoundingClientRect()
    const nx = (clientX - rect.left) / rect.width
    const ny = (clientY - rect.top) / rect.height
    return [Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny))]
  }, [])

  // ── Mouse handlers ───────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (annotMode && e.button === 0) {
      e.preventDefault()
      e.stopPropagation()
      const [nx, ny] = getNormalizedCoords(e.clientX, e.clientY)
      if (currentTool === 'lasso') {
        setDrawingShape({ type: 'lasso', points: [[nx, ny]], color: drawColor, strokeWidth: 2 })
      } else if (currentTool === 'freehand') {
        setDrawingShape({ type: 'freehand', points: [[nx, ny]], color: drawColor, strokeWidth: 2 })
      } else {
        setDrawingShape({ type: currentTool, points: [[nx, ny]], color: drawColor, strokeWidth: 2 })
      }
      return
    }
    if (e.button === 2) {
      e.preventDefault()
      setWlActive(true)
      wlStart.current = { w: windowWidth, c: windowCenter, x: e.clientX, y: e.clientY }
    } else if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    }
  }, [annotMode, currentTool, drawColor, windowWidth, windowCenter, pan, getNormalizedCoords])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (annotMode && drawingShape) {
      const [nx, ny] = getNormalizedCoords(e.clientX, e.clientY)
      setDrawingShape((prev: any) => {
        if (!prev) return prev
        if (prev.type === 'freehand' || prev.type === 'lasso') {
          return { ...prev, points: [...prev.points, [nx, ny]] }
        }
        // rectangle, ellipse, arrow, ruler: start + end point
        return { ...prev, points: [prev.points[0], [nx, ny]] }
      })
      return
    }
    if (wlActive) {
      const dx = e.clientX - wlStart.current.x
      const dy = e.clientY - wlStart.current.y
      setWindowWidth(Math.max(1, wlStart.current.w + dx * 2))
      setWindowCenter(wlStart.current.c - dy * 2)
      setActivePreset('')
    } else if (isPanning) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      })
    }
  }, [annotMode, drawingShape, wlActive, isPanning, getNormalizedCoords])

  const handleMouseUp = useCallback(() => {
    if (annotMode && drawingShape) {
      if (drawingShape.points.length >= 2) {
        // For lasso, auto-close the path
        const finalShape = drawingShape.type === 'lasso'
          ? { ...drawingShape, points: [...drawingShape.points, drawingShape.points[0]] }
          : drawingShape
        onAnnotationDraw?.([finalShape])
      }
      setDrawingShape(null)
      return
    }
    setWlActive(false)
    setIsPanning(false)
  }, [annotMode, drawingShape, onAnnotationDraw])

  const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': e.preventDefault(); goToSlice(sliceIndex + 1); break
      case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); goToSlice(sliceIndex - 1); break
      case ' ': e.preventDefault(); setCineActive(c => !c); break
      case 'a': case 'A': setAnnotMode(m => !m); break
      case 'r': case 'R': setZoom(1); setPan({ x: 0, y: 0 }); break
      case 'Escape': setAnnotMode(false); setCineActive(false); setDrawingShape(null); break
    }
  }, [sliceIndex, goToSlice])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    goToSlice(Math.round(((e.clientX - rect.left) / rect.width) * (sliceCount - 1)))
  }, [sliceCount, goToSlice])

  const handleSeriesClick = (i: number) => {
    setActiveSeries(i)
    onSeriesChange?.(i)
    setCineActive(false)
  }

  const applyPreset = (name: string) => {
    const [w, c] = WL_PRESETS[name] || [0, 0]
    setWindowWidth(w); setWindowCenter(c); setActivePreset(name)
  }

  const progress = sliceCount > 1 ? sliceIndex / (sliceCount - 1) : 0

  // ── SVG annotation rendering ─────────────────────────────────────────────
  const renderShapeSvg = (shape: any, i: number) => {
    const pts = shape.points || []
    if (pts.length < 1) return null
    const color = shape.color || '#ff0000'
    const sw = shape.strokeWidth || 2

    if ((shape.type === 'freehand' || shape.type === 'lasso') && pts.length > 1) {
      let d = pts.map((p: number[], j: number) =>
        `${j === 0 ? 'M' : 'L'}${(p[0] * 100).toFixed(2)} ${(p[1] * 100).toFixed(2)}`
      ).join(' ')
      if (shape.type === 'lasso') d += ' Z'
      return <path key={i} d={d} fill={shape.type === 'lasso' ? `${color}22` : 'none'}
        stroke={color} strokeWidth={sw} vectorEffect="non-scaling-stroke"
        strokeDasharray={shape.type === 'lasso' ? '6 3' : undefined} />
    }
    if (pts.length < 2) return null
    const [p1, p2] = pts
    const x1 = p1[0] * 100, y1 = p1[1] * 100, x2 = p2[0] * 100, y2 = p2[1] * 100

    if (shape.type === 'rectangle') {
      return <rect key={i} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        fill="none" stroke={color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
    }
    if (shape.type === 'ellipse') {
      return <ellipse key={i} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2}
        fill="none" stroke={color} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
    }
    if (shape.type === 'arrow' || shape.type === 'ruler') {
      return <g key={i}>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={sw} vectorEffect="non-scaling-stroke"
          markerEnd={shape.type === 'arrow' ? 'url(#ah)' : undefined} />
        {shape.type === 'ruler' && (
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 1.5}
            fill={color} fontSize="3" textAnchor="middle" dominantBaseline="auto">
            {Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) * 5)}px
          </text>
        )}
      </g>
    }
    return null
  }

  if (!series) return <div style={{ padding: 20, color: '#666' }}>No imaging data</div>

  const allShapes = [...(annotations || []), ...(drawingShape ? [drawingShape] : [])]

  return (
    <div style={{ display: 'flex', height, background: '#0a0a0a', borderRadius: 6, overflow: 'hidden', userSelect: 'none' }}>

      {/* ── Series strip ─────────────────────────────────── */}
      {!compact && (
        <div style={{
          width: 120, flexShrink: 0, background: '#0e0e11', borderRight: '1px solid #1a1a1f',
          overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 3,
        }}>
          <div style={{ fontSize: 9, color: '#444', padding: '4px 3px 2px', textTransform: 'uppercase', letterSpacing: 1.5 }}>Series</div>
          {imagingCase.series.map((s, i) => (
            <div key={s.name} onClick={() => handleSeriesClick(i)} title={s.name}
              style={{
                cursor: 'pointer', borderRadius: 3, overflow: 'hidden',
                border: i === activeSeries ? '2px solid #3b82f6' : '2px solid transparent',
                position: 'relative', flexShrink: 0,
              }}>
              <img src={buildUrl(imagingCase.name, s.name, 0)} alt={s.name}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', background: '#111' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', padding: '10px 4px 3px' }}>
                <div style={{ fontSize: 9, color: i === activeSeries ? '#93c5fd' : '#aaa', fontWeight: i === activeSeries ? 700 : 400, lineHeight: 1.2 }}>
                  {s.name.replace(/^\d+\s*/, '')}
                </div>
                <div style={{ fontSize: 8, color: '#555' }}>{s.slice_count} sl</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main viewer ──────────────────────────────────── */}
      <div ref={containerRef} tabIndex={0}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}
        style={{
          flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000', cursor: annotMode ? 'crosshair' : wlActive ? 'ew-resize' : isPanning ? 'grab' : 'default',
          outline: 'none', overflow: 'hidden',
        }}>

        {/* Canvas + Annotation SVG — both in zoom/pan container */}
        <div ref={imageWrapRef} style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transition: wlActive || isPanning || annotMode ? 'none' : 'transform 0.05s',
          position: 'relative', display: 'inline-block',
        }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: height - 30, display: 'block' }} />
          {/* Heatmap overlay canvas */}
          <canvas ref={heatmapCanvasRef} style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', mixBlendMode: 'screen', display: showHeatmap ? 'block' : 'none',
          }} />

          {/* SVG overlay — exactly matches canvas size via viewBox 0 0 100 100 */}
          {allShapes.length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#ff0000" />
                </marker>
              </defs>
              {allShapes.map((s: any, i: number) => renderShapeSvg(s, i))}
            </svg>
          )}
        </div>

        {/* ── Overlays ─────────────────────────────────── */}

        {/* Top-left: DICOM metadata */}
        <div style={{ position: 'absolute', top: 6, left: compact ? 8 : 8, pointerEvents: 'none', textShadow: '0 1px 3px #000' }}>
          <div style={{ color: '#e5e7eb', fontSize: 11, fontWeight: 600 }}>{caseInfo?.title || imagingCase.name}</div>
          <div style={{ color: '#9ca3af', fontSize: 10 }}>
            {caseInfo?.patient_age && <span>{caseInfo.patient_age}{caseInfo.patient_sex ? `/${caseInfo.patient_sex[0]}` : ''} &middot; </span>}
            {series.name}
          </div>
          {caseInfo?.modality && <div style={{ color: '#6b7280', fontSize: 9 }}>{caseInfo.modality}</div>}
        </div>

        {/* Top-right: badges + slice counter */}
        <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 6, alignItems: 'start' }}>
          {annotMode && <span style={{ background: '#dc2626', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>ANNOTATE</span>}
          {cineActive && <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>CINE {cineFps}fps</span>}
          {zoom !== 1 && <span style={{ background: '#d97706', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>{Math.round(zoom * 100)}%</span>}
          <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: '2px 8px', borderRadius: 4 }}>
            {sliceIndex + 1}/{sliceCount}
          </div>
        </div>

        {/* Bottom-right: W/L */}
        {activePreset !== 'Default' && windowWidth > 0 && (
          <div style={{ position: 'absolute', bottom: 34, right: 8, color: '#555', fontSize: 9, pointerEvents: 'none' }}>
            W:{Math.round(windowWidth)} L:{Math.round(windowCenter)}
          </div>
        )}

        {/* ── Annotation toolbar ────────────────────────── */}
        {enableAnnotation && (
          <div style={{
            position: 'absolute', left: compact ? 8 : 8, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', gap: 2, background: 'rgba(0,0,0,0.75)',
            borderRadius: 6, padding: 4,
          }}>
            {[
              { key: 'rectangle', icon: '▭', tip: 'Rectangle (R)' },
              { key: 'ellipse', icon: '○', tip: 'Ellipse (E)' },
              { key: 'arrow', icon: '→', tip: 'Arrow' },
              { key: 'freehand', icon: '✎', tip: 'Freehand' },
              { key: 'lasso', icon: '⭕', tip: 'Lasso' },
              { key: 'ruler', icon: '📏', tip: 'Ruler' },
            ].map(t => (
              <button key={t.key} title={t.tip} onClick={() => { setCurrentTool(t.key); setAnnotMode(true) }}
                style={{
                  width: 28, height: 28, borderRadius: 4, border: 'none', fontSize: 14,
                  background: annotMode && currentTool === t.key ? '#2563eb' : 'transparent',
                  color: annotMode && currentTool === t.key ? '#fff' : '#888',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {t.icon}
              </button>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '2px 0' }} />
            {['#ff0000', '#ffff00', '#00ff00', '#00aaff', '#ffffff'].map(c => (
              <button key={c} onClick={() => setDrawColor(c)}
                style={{
                  width: 28, height: 12, borderRadius: 3,
                  border: drawColor === c ? '2px solid #fff' : '1px solid #333',
                  background: c, cursor: 'pointer', padding: 0,
                }} />
            ))}
          </div>
        )}

        {/* ── Right toolbar: W/L + Heatmap + Propagate ── */}
        <div style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 2, background: 'rgba(0,0,0,0.55)',
          borderRadius: 6, padding: 3,
        }}>
          {Object.keys(WL_PRESETS).map(name => (
            <button key={name} onClick={() => applyPreset(name)}
              style={{
                padding: '3px 6px', borderRadius: 3, border: 'none', fontSize: 8,
                background: activePreset === name ? '#2563eb' : 'transparent',
                color: activePreset === name ? '#fff' : '#555',
                cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
              }}>
              {name === 'Default' ? 'Reset' : name}
            </button>
          ))}

          <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '3px 0' }} />

          {/* Heatmap toggle — always visible */}
          <button onClick={() => setShowHeatmap(h => !h)}
            title={heatmapModel ? 'Toggle heatmap overlay' : 'Place heatmaps in heatmaps/ folder to enable'}
            style={{
              padding: '3px 6px', borderRadius: 3, border: 'none', fontSize: 8,
              background: showHeatmap && heatmapModel ? '#dc2626' : 'transparent',
              color: showHeatmap && heatmapModel ? '#fff' : '#555',
              cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
              opacity: heatmapModel ? 1 : 0.5,
            }}>
            🔥 Heatmap
          </button>
          {showHeatmap && heatmapModel && (
            <input type="range" min={0} max={100} value={hmOpacity * 100}
              onChange={e => setHmOpacity(Number(e.target.value) / 100)}
              style={{ width: '100%', accentColor: '#dc2626' }} title={`Opacity: ${Math.round(hmOpacity * 100)}%`} />
          )}

          {/* Smart propagation — always visible when annotation enabled */}
          {enableAnnotation && (
            <button onClick={() => lastAnnotationId ? onAnnotationPropagate?.(lastAnnotationId) : alert('Draw an annotation first, then click Propagate to auto-fill adjacent slices.')}
              title="Propagate last annotation to adjacent slices (auto-scaling)"
              style={{
                padding: '3px 6px', borderRadius: 3, border: 'none', fontSize: 8,
                background: lastAnnotationId ? '#8b5cf6' : 'transparent',
                color: lastAnnotationId ? '#fff' : '#555',
                cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
              }}>
              ↕ Propagate
            </button>
          )}
        </div>

        {/* ── Progress bar ──────────────────────────────── */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6,
        }}>
          <button onClick={() => setCineActive(c => !c)}
            style={{ background: 'none', border: 'none', color: cineActive ? '#4ade80' : '#555', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>
            {cineActive ? '⏸' : '▶'}
          </button>
          <div onClick={handleProgressClick}
            style={{ flex: 1, height: 3, background: '#1f2937', borderRadius: 2, position: 'relative', cursor: 'pointer' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: '#3b82f6', borderRadius: 2 }} />
            <div style={{
              position: 'absolute', left: `${progress * 100}%`, top: '50%', transform: 'translate(-50%, -50%)',
              width: 10, height: 10, background: '#eff6ff', borderRadius: '50%', boxShadow: '0 0 0 2px #3b82f6',
            }} />
          </div>
          {cineActive && (
            <input type="range" min={1} max={30} value={cineFps} onChange={e => setCineFps(Number(e.target.value))}
              style={{ width: 50, accentColor: '#3b82f6' }} />
          )}
        </div>
      </div>
    </div>
  )
}
