/**
 * ConferencePage — MDT consensus conference with host-controlled navigation,
 * real-time chat, and voting.
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, getToken } from '../api/client'
import MultiSliceViewer from '../components/MultiSliceViewer'
import type { ImagingCase } from '../components/MultiSliceViewer'
import type { User } from '../App'

interface Participant { user_id: number; name: string; color: string }
interface ChatMsg { user_id: number; name: string; message: string; timestamp: string }

export default function ConferencePage({ user }: { user: User }) {
  const { confId } = useParams()
  const navigate = useNavigate()
  const [connected, setConnected] = useState(false)
  const [confState, setConfState] = useState<any>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [myColor, setMyColor] = useState('#3b82f6')
  const [vote, setVote] = useState<any>(null)
  const [voteResults, setVoteResults] = useState<Record<string, string>>({})
  const [imagingData, setImagingData] = useState<ImagingCase | null>(null)
  const [sliceIndex, setSliceIndex] = useState(0)
  const [seriesIndex, setSeriesIndex] = useState(0)
  const [voteQuestion, setVoteQuestion] = useState('Do you agree with this finding?')

  const wsRef = useRef<WebSocket | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Connect WebSocket
  useEffect(() => {
    if (!confId) return
    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/conference/${confId}?token=${token}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'set_name', name: user.full_name }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      switch (msg.type) {
        case 'conference_state':
          setConfState(msg)
          setIsHost(msg.is_host)
          setMyColor(msg.your_color)
          setParticipants(msg.participants)
          setChat(msg.chat)
          setSliceIndex(msg.state.slice_index)
          setSeriesIndex(msg.state.series_index)
          // Load imaging data for the case
          api.getCaseImaging(msg.case_id).then(img => {
            if (img?.series?.length > 0 && img.imaging_folder_name) {
              setImagingData({ name: img.imaging_folder_name, series: img.series })
            }
          })
          break
        case 'participants_update':
          setParticipants(msg.participants); break
        case 'participant_joined':
        case 'participant_left':
          break
        case 'navigate':
          setSliceIndex(msg.slice_index)
          setSeriesIndex(msg.series_index)
          break
        case 'chat':
          setChat(prev => [...prev, msg]); break
        case 'vote_started':
          setVote(msg.vote); setVoteResults({}); break
        case 'vote_update':
          setVoteResults(msg.votes); break
        case 'vote_ended':
          setVote(null); break
      }
    }

    ws.onclose = () => setConnected(false)
    return () => { ws.close() }
  }, [confId, user.full_name])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  const send = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  const handleSliceChange = (idx: number) => {
    if (isHost) send({ type: 'navigate', series_index: seriesIndex, slice_index: idx })
    setSliceIndex(idx)
  }

  const handleSeriesChange = (idx: number) => {
    if (isHost) send({ type: 'navigate', series_index: idx, slice_index: sliceIndex })
    setSeriesIndex(idx)
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    send({ type: 'chat', message: chatInput })
    setChatInput('')
  }

  const startVote = () => {
    send({ type: 'start_vote', question: voteQuestion, options: ['Agree', 'Disagree', 'Unsure'] })
  }

  if (!connected || !confState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Connecting to conference...</p>
        <Link to="/" style={{ marginTop: 12, display: 'inline-block' }}>Back to Cases</Link>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Viewer */}
      <div style={{ flex: '0 0 60%', borderRight: '1px solid var(--gray-200)' }}>
        {imagingData ? (
          <MultiSliceViewer
            imagingCase={imagingData}
            height={window.innerHeight - 56}
            controlledSliceIndex={sliceIndex}
            controlledSeriesIndex={seriesIndex}
            onSliceChange={handleSliceChange}
            onSeriesChange={handleSeriesChange}
            compact={false}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#555', height: '100%' }}>
            Loading imaging...
          </div>
        )}
      </div>

      {/* Right: Conference panel */}
      <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 14, margin: 0 }}>{confState.title}</h3>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
              Host: {confState.host_name} {isHost && '(you)'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--success)' }}>{participants.length} online</span>
          </div>
        </div>

        {/* Participants */}
        <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {participants.map(p => (
            <span key={p.user_id} style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 500,
              background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}44`,
            }}>
              {p.name} {p.user_id === confState.host_id && '★'}
            </span>
          ))}
        </div>

        {/* Vote section */}
        {isHost && !vote && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={voteQuestion} onChange={e => setVoteQuestion(e.target.value)}
              placeholder="Vote question..." style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} />
            <button className="btn-primary" onClick={startVote} style={{ fontSize: 10, padding: '4px 10px' }}>Start Vote</button>
          </div>
        )}

        {vote && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-200)', background: 'var(--primary-light)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{vote.question}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {vote.options.map((opt: string) => {
                const voteCount = Object.values(voteResults).filter(v => v === opt).length
                return (
                  <button key={opt} onClick={() => send({ type: 'cast_vote', choice: opt })}
                    style={{
                      padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      border: '1px solid var(--gray-200)', background: 'var(--gray-100)',
                    }}>
                    {opt} ({voteCount})
                  </button>
                )
              })}
            </div>
            {isHost && (
              <button onClick={() => send({ type: 'end_vote' })}
                style={{ marginTop: 6, fontSize: 10, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                End Vote
              </button>
            )}
          </div>
        )}

        {/* Chat */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
          {chat.map((msg, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: participants.find(p => p.user_id === msg.user_id)?.color || 'var(--gray-500)' }}>
                {msg.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--gray-600)', marginLeft: 6 }}>{msg.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: 6 }}>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Type a message..." style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} />
          <button className="btn-primary" onClick={sendChat} style={{ fontSize: 11, padding: '6px 12px' }}>Send</button>
        </div>

        {/* Host note */}
        {!isHost && (
          <div style={{ padding: '6px 14px', borderTop: '1px solid var(--gray-200)', fontSize: 10, color: 'var(--gray-400)', textAlign: 'center' }}>
            Navigation controlled by host. You can chat and vote.
          </div>
        )}
      </div>
    </div>
  )
}
