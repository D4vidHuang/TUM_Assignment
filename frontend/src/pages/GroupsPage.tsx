/**
 * GroupsPage — Zotero-style research group / image library management.
 * Admin can create groups, assign members, assign cases, configure LLM API.
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { User } from '../App'

interface GroupMember { id: number; username: string; full_name: string; role: string }
interface Group {
  id: number; name: string; description: string | null; color: string
  llm_provider: string | null; llm_api_url: string | null; llm_model_name: string | null; llm_configured: boolean
  llm_api_key: string | null
  owner_id: number; owner_name: string | null; member_count: number; case_count: number
  members: GroupMember[]; case_ids: number[]
}
interface CaseItem { id: number; title: string; modality: string | null }
interface UserItem { id: number; username: string; full_name: string; role: string }

export default function GroupsPage({ user }: { user: User }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [cases, setCases] = useState<CaseItem[]>([])
  const [allUsers, setAllUsers] = useState<UserItem[]>([])
  const [selected, setSelected] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // LLM config editing
  const [editLLM, setEditLLM] = useState(false)
  const [llmProvider, setLlmProvider] = useState('')
  const [llmKey, setLlmKey] = useState('')
  const [llmUrl, setLlmUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')

  const isAdmin = user.role === 'admin'

  const reload = async () => {
    const [g, c] = await Promise.all([api.getGroups(), api.getCases()])
    setGroups(g)
    setCases(c)
    if (isAdmin) {
      const u = await api.getAllUsers()
      setAllUsers(u)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const selectGroup = async (g: Group) => {
    const full = await api.getGroup(g.id)
    setSelected(full)
    setLlmProvider(full.llm_provider || '')
    setLlmKey(full.llm_api_key || '')
    setLlmUrl(full.llm_api_url || '')
    setLlmModel(full.llm_model_name || '')
    setEditLLM(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    await api.createGroup({ name: newName, description: newDesc })
    setNewName(''); setNewDesc(''); setShowCreate(false)
    reload()
  }

  const handleAddMember = async (uid: number) => {
    if (!selected) return
    await api.addGroupMember(selected.id, uid)
    selectGroup(selected)
    reload()
  }

  const handleRemoveMember = async (uid: number) => {
    if (!selected) return
    await api.removeGroupMember(selected.id, uid)
    selectGroup(selected)
    reload()
  }

  const handleAssignCase = async (cid: number) => {
    if (!selected) return
    await api.assignGroupCase(selected.id, cid)
    selectGroup(selected)
    reload()
  }

  const handleUnassignCase = async (cid: number) => {
    if (!selected) return
    await api.unassignGroupCase(selected.id, cid)
    selectGroup(selected)
    reload()
  }

  const handleSaveLLM = async () => {
    if (!selected) return
    await api.updateGroup(selected.id, {
      llm_provider: llmProvider || null,
      llm_api_key: llmKey || null,
      llm_api_url: llmUrl || null,
      llm_model_name: llmModel || null,
    })
    selectGroup(selected)
    setEditLLM(false)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading groups...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* ── Left: Group list ─────────────────────────── */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--gray-200)',
        display: 'flex', flexDirection: 'column', background: 'var(--gray-50)',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>Research Groups</h2>
          {isAdmin && (
            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setShowCreate(true)}>
              + New
            </button>
          )}
        </div>

        {showCreate && (
          <div style={{ padding: 12, borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-100)' }}>
            <input placeholder="Group name" value={newName} onChange={e => setNewName(e.target.value)}
              style={{ marginBottom: 6, fontSize: 12 }} />
            <input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              style={{ marginBottom: 6, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={handleCreate}>Create</button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} onClick={() => selectGroup(g)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--gray-200)',
                background: selected?.id === g.id ? 'var(--primary-light)' : 'transparent',
                borderLeft: `3px solid ${g.color}`,
              }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                {g.member_count} members &middot; {g.case_count} cases
                {g.llm_configured && <span> &middot; AI</span>}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              {isAdmin ? 'Create your first research group' : 'No groups assigned to you'}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Group detail ──────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!selected ? (
          <div style={{ textAlign: 'center', paddingTop: 100, color: 'var(--gray-400)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
            <p>Select a research group to manage</p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: selected.color, display: 'inline-block' }} />
                  {selected.name}
                </h1>
                {selected.description && <p style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 4 }}>{selected.description}</p>}
              </div>
            </div>

            {/* ── Members section ─────────────────────── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>Members ({selected.members.length})</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.members.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 20,
                    background: 'var(--gray-100)', fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 500 }}>{m.full_name}</span>
                    <span style={{ color: 'var(--gray-400)', fontSize: 10 }}>{m.role}</span>
                    {isAdmin && m.id !== selected.owner_id && (
                      <button onClick={() => handleRemoveMember(m.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div style={{ marginTop: 10 }}>
                  <select onChange={e => { if (e.target.value) handleAddMember(Number(e.target.value)); e.target.value = '' }}
                    style={{ fontSize: 12, padding: '4px 8px', width: 200 }}>
                    <option value="">+ Add member...</option>
                    {allUsers.filter(u => !selected.members.some(m => m.id === u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ── Case library section ───────────────── */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>Image Library ({selected.case_ids.length} cases)</h3>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr><th style={{ fontSize: 12 }}>Case</th><th style={{ fontSize: 12 }}>Modality</th>{isAdmin && <th style={{ fontSize: 12, width: 60 }}></th>}</tr>
                </thead>
                <tbody>
                  {cases.filter(c => selected.case_ids.includes(c.id)).map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{c.title}</td>
                      <td style={{ fontSize: 12 }}>{c.modality}</td>
                      {isAdmin && (
                        <td>
                          <button onClick={() => handleUnassignCase(c.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}>
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {isAdmin && (
                <div style={{ marginTop: 10 }}>
                  <select onChange={e => { if (e.target.value) handleAssignCase(Number(e.target.value)); e.target.value = '' }}
                    style={{ fontSize: 12, padding: '4px 8px', width: 250 }}>
                    <option value="">+ Assign case to group...</option>
                    {cases.filter(c => !selected.case_ids.includes(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ── LLM Configuration ─────────────────── */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>AI Assistant Configuration</h3>
                {(isAdmin || selected.owner_id === user.id) && (
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setEditLLM(!editLLM)}>
                    {editLLM ? 'Cancel' : 'Configure'}
                  </button>
                )}
              </div>

              {!editLLM ? (
                <div style={{ fontSize: 13 }}>
                  {selected.llm_configured ? (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span><strong>Provider:</strong> {selected.llm_provider || 'openai'}</span>
                      <span><strong>Model:</strong> {selected.llm_model_name || 'default'}</span>
                      {selected.llm_api_url && <span><strong>URL:</strong> {selected.llm_api_url}</span>}
                      <span style={{ color: 'var(--success)' }}>✓ Configured</span>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--gray-400)' }}>No AI model configured. Group admin can set up an API key to enable AI-assisted analysis.</p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Provider</label>
                    <select value={llmProvider} onChange={e => setLlmProvider(e.target.value)} style={{ fontSize: 12 }}>
                      <option value="openai">OpenAI (GPT-4o)</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="custom">Custom OpenAI-compatible</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>API Key</label>
                    <input type="password" value={llmKey} onChange={e => setLlmKey(e.target.value)}
                      placeholder="sk-..." style={{ fontSize: 12 }} />
                  </div>
                  {llmProvider === 'custom' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>API URL</label>
                      <input value={llmUrl} onChange={e => setLlmUrl(e.target.value)}
                        placeholder="https://your-server.com/v1" style={{ fontSize: 12 }} />
                    </div>
                  )}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Model Name</label>
                    <input value={llmModel} onChange={e => setLlmModel(e.target.value)}
                      placeholder={llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
                      style={{ fontSize: 12 }} />
                  </div>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }} onClick={handleSaveLLM}>
                    Save Configuration
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
