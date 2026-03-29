/**
 * useCollaboration — WebSocket hook for real-time cursor + annotation sharing.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { getToken } from '../api/client'

interface Peer {
  user_id: number
  name: string
  color: string
  x?: number
  y?: number
  series?: string
  slice?: number
  shape?: any  // live drawing shape
}

interface UseCollaborationResult {
  peers: Map<number, Peer>
  myColor: string
  connected: boolean
  enabled: boolean
  setEnabled: (v: boolean) => void
  sendCursorMove: (x: number, y: number, series: string, slice: number) => void
  sendAnnotationUpdate: (shape: any, series: string, slice: number) => void
  sendAnnotationSaved: (annotationId: number) => void
}

export function useCollaboration(caseId: number | null, userName: string): UseCollaborationResult {
  const [peers, setPeers] = useState<Map<number, Peer>>(new Map())
  const [myColor, setMyColor] = useState('#3b82f6')
  const [connected, setConnected] = useState(false)
  const [enabled, setEnabled] = useState(() => localStorage.getItem('collab_enabled') !== 'false')
  const wsRef = useRef<WebSocket | null>(null)
  const throttleRef = useRef(0)

  useEffect(() => {
    localStorage.setItem('collab_enabled', String(enabled))
  }, [enabled])

  useEffect(() => {
    if (!caseId || !enabled) {
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setPeers(new Map())
      return
    }

    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/collab/${caseId}?token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'set_name', name: userName }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      switch (msg.type) {
        case 'peer_list':
          setMyColor(msg.your_color)
          const initial = new Map<number, Peer>()
          for (const p of msg.peers) initial.set(p.user_id, p)
          setPeers(initial)
          break

        case 'user_joined':
          setPeers(prev => {
            const next = new Map(prev)
            for (const p of msg.peers) {
              if (!next.has(p.user_id)) next.set(p.user_id, p)
            }
            return next
          })
          break

        case 'user_left':
          setPeers(prev => {
            const next = new Map(prev)
            next.delete(msg.user_id)
            return next
          })
          break

        case 'user_renamed':
          setPeers(prev => {
            const next = new Map(prev)
            const existing = next.get(msg.user_id)
            if (existing) next.set(msg.user_id, { ...existing, name: msg.name })
            return next
          })
          break

        case 'cursor_move':
          setPeers(prev => {
            const next = new Map(prev)
            next.set(msg.user_id, {
              user_id: msg.user_id, name: msg.name, color: msg.color,
              x: msg.x, y: msg.y, series: msg.series, slice: msg.slice,
            })
            return next
          })
          break

        case 'annotation_update':
          setPeers(prev => {
            const next = new Map(prev)
            const existing = next.get(msg.user_id) || { user_id: msg.user_id, name: msg.name, color: msg.color }
            next.set(msg.user_id, { ...existing, shape: msg.shape, series: msg.series, slice: msg.slice })
            return next
          })
          break

        case 'annotation_saved':
          // Clear the live shape for that user
          setPeers(prev => {
            const next = new Map(prev)
            const existing = next.get(msg.user_id)
            if (existing) next.set(msg.user_id, { ...existing, shape: undefined })
            return next
          })
          break
      }
    }

    ws.onclose = () => { setConnected(false) }
    ws.onerror = () => { setConnected(false) }

    return () => { ws.close(); wsRef.current = null }
  }, [caseId, enabled, userName])

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const sendCursorMove = useCallback((x: number, y: number, series: string, slice: number) => {
    // Throttle to 20fps
    const now = Date.now()
    if (now - throttleRef.current < 50) return
    throttleRef.current = now
    send({ type: 'cursor_move', x, y, series, slice })
  }, [send])

  const sendAnnotationUpdate = useCallback((shape: any, series: string, slice: number) => {
    send({ type: 'annotation_update', shape, series, slice })
  }, [send])

  const sendAnnotationSaved = useCallback((annotationId: number) => {
    send({ type: 'annotation_saved', annotation_id: annotationId })
  }, [send])

  return { peers, myColor, connected, enabled, setEnabled, sendCursorMove, sendAnnotationUpdate, sendAnnotationSaved }
}
