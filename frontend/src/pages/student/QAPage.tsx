import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface SessionItem {
  id: number; thread_id: string; title: string; turn_count: number
  course_id: number | null; created_at: string | null; updated_at: string | null
}

interface SourceItem { chunk_id?: number; document_id?: number; title: string; score: number; url?: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string; sources?: SourceItem[] | null; isRejected?: boolean; rejectionReason?: string; progress?: string }

interface SessionDetail {
  id: number; thread_id: string; title: string; turn_count: number
  course_id: number | null; chat_history: ChatMessage[]
  created_at: string | null; updated_at: string | null
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let inList = false; let listItems: React.ReactNode[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(<ul key={result.length} style={{ margin: '8px 0', paddingLeft: 20 }}>{listItems}</ul>)
      listItems = []
    }
  }

  for (const line of lines) {
    if (/^### (.+)/.test(line)) {
      flushList(); inList = false
      result.push(<h3 key={result.length} style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '16px 0 8px' }}>{line.replace(/^### /, '')}</h3>)
    } else if (/^## (.+)/.test(line)) {
      flushList(); inList = false
      result.push(<h2 key={result.length} style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '16px 0 8px' }}>{line.replace(/^## /, '')}</h2>)
    } else if (/^- (.+)/.test(line)) {
      inList = true
      listItems.push(<li key={listItems.length} style={{ marginBottom: 4 }}>{renderInline(line.replace(/^- /, ''))}</li>)
    } else if (line.trim() === '') {
      if (inList) { flushList(); inList = false }
    } else if (/^> (.+)/.test(line)) {
      flushList(); inList = false
      result.push(
        <blockquote key={result.length} style={{
          borderLeft: '3px solid var(--seal-sky)', background: 'rgba(238,242,255,0.5)', borderRadius: '0 8px 8px 0',
          padding: '12px 16px', margin: '12px 0', fontSize: 13, color: '#475569',
        }}>
          {line.replace(/^> /, '')}
        </blockquote>
      )
    } else if (/^\d+\.\s(.+)/.test(line)) {
      flushList(); inList = false
      const m = line.match(/^(\d+)\.\s(.+)/)!
      result.push(
        <div key={result.length} style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--seal-ice)', color: 'var(--seal-primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{m[1]}</span>
          <span style={{ fontSize: 14, color: '#334155' }}>{renderInline(m[2])}</span>
        </div>
      )
    } else if (line.trim()) {
      flushList(); inList = false
      result.push(<p key={result.length} style={{ margin: '4px 0', fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{renderInline(line)}</p>)
    }
  }
  flushList()
  return result
}

function renderInline(text: string): React.ReactNode {
  // Split by **bold** and [来源N] patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\[来源\d+\])/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>
    }
    if (/^\[来源\d+\]$/.test(p)) {
      return (
        <span key={i} style={{
          fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500,
          background: 'var(--seal-ice)', color: 'var(--seal-primary-hover)', marginLeft: 4,
        }}>{p}</span>
      )
    }
    return p
  })
}

const SUGGESTED_QUESTIONS = [
  '什么是进程调度？操作系统有哪些常见调度算法？',
  '高等数学中导数的几何意义是什么？',
  '数据结构中二叉树的遍历方式有哪些？',
  '大学物理电磁学部分的核心概念是什么？',
]

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes thinking-dot { 0%, 80%, 100% { transform: scale(0.4); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
  .qa-fade { animation: fadeInUp 0.3s ease-out both; }
  .qa-dot { animation: pulse 1.2s ease-in-out infinite; }
  .qa-dot:nth-child(2) { animation-delay: 0.2s; }
  .qa-dot:nth-child(3) { animation-delay: 0.4s; }
  .qa-scrollbar::-webkit-scrollbar { width: 4px; }
  .qa-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }
  .qa-session-item .qa-delete-btn { opacity: 0; }
  .qa-session-item:hover .qa-delete-btn { opacity: 1; }
`

export default function QAPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<{ docId: number; title: string; score: number } | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [lastQuestion, setLastQuestion] = useState('') // for regenerate
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState(false)
  const [feedbackType, setFeedbackType] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const r = await api.get<APIResponse<PaginatedResponse<SessionItem>>>('/qa/sessions', { params: { page: 1, page_size: 50 } })
      if (r.data.code === 0 && r.data.data) {
        setSessions(r.data.data.items ?? [])
      }
    } catch (e) { console.error('加载会话列表失败', e) }
  }, [])

  useEffect(() => { loadSessions() }, [])

  // Load session detail
  const loadSession = useCallback(async (sessionId: number) => {
    setLoadingSession(true)
    try {
      const r = await api.get<APIResponse<SessionDetail>>(`/qa/sessions/${sessionId}`)
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data
        setActiveThreadId(d.thread_id)
        setActiveSessionId(d.id)
        setMessages(d.chat_history)
      }
    } catch (e) { console.error('加载会话详情失败', e) }
    finally { setLoadingSession(false) }
  }, [])

  // Auto-load from URL param
  useEffect(() => {
    const q = searchParams.get('question')
    if (q && !activeThreadId) {
      setInput(q)
      doAsk(q)
    }
  }, [])

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  const abortRef = useRef<AbortController | null>(null)

  /** 从 localStorage 读取 JWT token（与 api.ts 保持一致） */
  const getToken = (): string | null => {
    try {
      const raw = localStorage.getItem('auth-storage')
      if (!raw) return null
      return JSON.parse(raw)?.state?.token ?? null
    } catch { return null }
  }

  /** 用 refresh_token 换取新的 access_token 并写回存储；失败返回 null。
   *  SSE 请求走裸 fetch，不经过 api.ts 的 axios 401 刷新拦截器，故在此自行刷新。 */
  const refreshAccessToken = async (): Promise<string | null> => {
    try {
      const raw = localStorage.getItem('auth-storage')
      if (!raw) return null
      const refreshToken = JSON.parse(raw)?.state?.refreshToken
      if (!refreshToken) return null
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return null
      const body = await res.json()
      if (body.code === 0 && body.data) {
        const parsed = JSON.parse(raw)
        parsed.state.token = body.data.access_token
        parsed.state.refreshToken = body.data.refresh_token
        localStorage.setItem('auth-storage', JSON.stringify(parsed))
        return body.data.access_token as string
      }
    } catch { /* fallthrough */ }
    return null
  }

  /** 发起 SSE 请求；遇到 401 时刷新 token 并重试一次 */
  const fetchQa = async (body: Record<string, string | number | boolean>, signal: AbortSignal): Promise<Response> => {
    const send = (token: string | null) => fetch('/api/v1/qa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
    let res = await send(getToken())
    if (res.status === 401) {
      const fresh = await refreshAccessToken()
      if (fresh) res = await send(fresh)
    }
    return res
  }

  const doAsk = async (q?: string, isRegenerate = false) => {
    const question = (q || input).trim()
    if (!question || asking) return

    // 取消上一次请求（如 regenerate 场景）
    abortRef.current?.abort()

    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setLastQuestion(question)
    setInput('')
    setAsking(true)

    const body: Record<string, string | number | boolean> = { question, use_web_search: useWebSearch }
    if (activeThreadId) body.thread_id = activeThreadId
    if (isRegenerate) body.regenerate = true

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetchQa(body, controller.signal)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // 初始化一个空的 AI 消息，后续流式填充。
      // 用 functional updater 取真实索引，避免依赖闭包中的 messages.length
      // （regenerate 场景下 messages 闭包值是陈旧的，会导致索引错位、流式更新丢失）
      const placeholder: ChatMessage = { role: 'assistant', content: '', progress: '正在分析问题意图...' }
      let aiIdx = 0
      setMessages((prev) => {
        aiIdx = prev.length
        return [...prev, placeholder]
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 最后一段可能不完整，保留到下一次
        buffer = lines.pop() || ''

        for (const line of lines) {
          // SSE 事件名行
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
            continue
          }
          // SSE 数据行
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          let payload: Record<string, unknown>
          try { payload = JSON.parse(jsonStr) } catch { continue }

          const updateMsg = (fn: (prev: ChatMessage) => Partial<ChatMessage>) => {
            setMessages((prev) => {
              const next = [...prev]
              if (next[aiIdx]) {
                next[aiIdx] = { ...next[aiIdx], ...fn(next[aiIdx]) }
              }
              return next
            })
          }

          switch (currentEvent) {
            case 'classify':
                  updateMsg(() => ({ progress: '正在识别问题意图...' }))
              break

            case 'retrieve': {
              const src = payload.source === 'web' ? '网络' : '课程'
              const msg = payload.has_results ? `已找到相关${src}资料` : `未找到${src}资料`
              updateMsg(() => ({ progress: msg }))
              break
            }

            case 'rerank':
                  updateMsg(() => ({ progress: '正在重排检索结果...' }))
              break

            case 'generate': {
              const len = payload.length as number | undefined
              updateMsg(() => ({ progress: `正在生成回答${len ? ` (${len} 字)` : '...'}` }))
              break
            }

            case 'review':
              updateMsg(() => ({ progress: '正在审核回答质量...' }))
              break

            case 'reject': {
              const reason = (payload.reason as string) ||
                    (payload.intent ? `问题意图被拒绝：${payload.intent}` : '无法处理该请求')
              updateMsg(() => ({
                content: '',
                progress: undefined,
                isRejected: true,
                rejectionReason: reason,
              }))
              break
            }

            case 'done': {
              const answer = (payload.answer as string) || ''
              const sources = (payload.sources as SourceItem[]) || []
              const isRejected = payload.is_rejected as boolean
              const rejectionReason = (payload.rejection_reason as string) || ''
              const threadId = payload.thread_id as string

              if (threadId && !activeThreadId) {
                setActiveThreadId(threadId)
              }
              // 设置当前会话 id，使反馈提交可用（feedback 的 qa_id 即 UserSession.id）
              if (typeof payload.session_id === 'number') {
                setActiveSessionId(payload.session_id)
              }
              if (searchParams.get('question')) {
                setSearchParams({}, { replace: true })
              }

              updateMsg(() => ({
                content: answer,
                progress: undefined,
                sources: (sources ?? []).map((s: SourceItem) => ({
                  chunk_id: s.chunk_id, document_id: s.document_id,
                  title: s.title, score: s.score, url: s.url,
                })),
                isRejected,
                rejectionReason: rejectionReason || undefined,
              }))
              break
            }

            case 'error':
              updateMsg(() => ({
                content: '',
                progress: undefined,
                isRejected: true,
                rejectionReason: '服务处理异常，请稍后重试',
              }))
              break
          }
          currentEvent = ''
        }
      }
      loadSessions()
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: '请求失败，请检查网络后重试',
        isRejected: true,
        rejectionReason: '网络请求异常',
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setAsking(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doAsk()
    }
  }

  const openPreview = async (src: SourceItem) => {
    // Web source → open URL in new tab
    if (src.url) {
      window.open(src.url, '_blank')
      return
    }
    // Internal document → side panel preview
    setPreviewSrc({ docId: src.document_id, title: src.title, score: src.score })
    setLoadingPreview(true)
    setPreviewFileUrl(null)
    try {
      const r = await api.get(`/documents/${src.document_id}/file`, { responseType: 'blob' })
      setPreviewFileUrl(URL.createObjectURL(r.data as Blob))
    } catch { /* */ }
    finally { setLoadingPreview(false) }
  }

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    }).catch(() => {})
  }

  const handleRegenerate = () => {
    if (!lastQuestion || asking) return
    // 移除最后一对消息（user + assistant），doAsk 会重新追加这对，避免重复的 user 气泡
    setMessages((prev) => {
      const next = [...prev]
      if (next.length && next[next.length - 1].role === 'assistant') next.pop()
      if (next.length && next[next.length - 1].role === 'user') next.pop()
      return next
    })
    // 有会话线程时走后端 regenerate（回滚最后一轮重答）；否则退化为普通重问
    doAsk(lastQuestion, Boolean(activeThreadId))
  }

  const submitFeedback = async () => {
    if (!feedbackType) { setFeedbackError('请先选择反馈类型'); return }
    if (!activeSessionId) { setFeedbackError('当前对话尚未就绪，无法提交反馈'); return }
    setFeedbackSubmitting(true)
    setFeedbackError('')
    try {
      await api.post('/feedback', { qa_id: activeSessionId, type: feedbackType, comment: feedbackComment })
      setFeedbackModal(false)
      setFeedbackType('')
      setFeedbackComment('')
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setFeedbackError(status === 409 ? '您已对该对话提交过反馈' : (detail || '提交失败，请稍后重试'))
    }
    finally { setFeedbackSubmitting(false) }
  }

  const newChat = () => {
    // Cancel any in-flight SSE stream and clear loading state so that
    // clicking "新对话" during AI generation immediately unfreezes the UI.
    abortRef.current?.abort()
    setAsking(false)
    setActiveThreadId(null)
    setActiveSessionId(null)
    setMessages([])
    setInput('')
    setLastQuestion('')
    setPreviewSrc(null)
    setPreviewFileUrl(null)
    // Refresh sidebar so the just-aborted conversation shows up immediately.
    // The backend creates UserSession on the first user message (before the
    // SSE stream finishes), so it is already persisted even if we abort mid-
    // generation. Without this call, the sidebar only refreshes after a full
    // doAsk() completes — leaving aborted conversations invisible until F5.
    loadSessions()
    inputRef.current?.focus()
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation()
    try {
      await api.delete(`/qa/sessions/${sessionId}`)
    } catch (e) { console.error('删除会话失败', e) }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSessionId === sessionId) newChat()
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
    return d.toLocaleDateString('zh-CN')
  }

  return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
        {/* ====== Left Sidebar ====== */}
        <div style={{
          width: 280, flexShrink: 0, borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', background: '#f8fafc',
        }}>
          {/* New Chat Button */}
          <div style={{ padding: '16px' }}>
            <button onClick={newChat}
              style={{
                width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 500,
                border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
                color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--seal-sky)'; e.currentTarget.style.color = 'var(--seal-primary-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155' }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              新对话
            </button>
          </div>

          {/* Session List */}
          <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {sessions.map((s) => (
              <div key={s.id} className="qa-session-item"
                onClick={() => loadSession(s.id)}
                style={{
                  padding: '12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer',
                  background: s.id === activeSessionId ? 'var(--seal-ice)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = '#f1f5f9' }}
                onMouseLeave={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 500, color: s.id === activeSessionId ? 'var(--seal-primary-hover)' : '#334155',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
                  }}>
                    {s.title}
                  </p>
                  <button className="qa-delete-btn" onClick={(e) => deleteSession(e, s.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1',
                      padding: 2, flexShrink: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1' }}>
                    <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                      <path d="M4 4h8M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  {s.turn_count} 轮 · {formatTime(s.updated_at)}
                </p>
              </div>
            ))}

            {sessions.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                暂无对话记录，开始新对话吧
              </p>
            )}
          </div>
        </div>

        {/* ====== Main Chat Area ====== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          {/* Messages */}
          <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
            <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 24px' }}>
              {loadingSession ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>加载中...</div>
              ) : messages.length === 0 && !asking ? (
                /* Welcome */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--seal-primary), var(--seal-sky))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                  }}>
                    <svg width={32} height={32} viewBox="0 0 32 32" fill="none">
                      <path d="M6 10h20M6 16h14M6 22h10" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>EduRAG 智能问答</h2>
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 32px', textAlign: 'center', maxWidth: 400 }}>
                    基于课程资料为你解答，支持多轮追问
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 500 }}>
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button key={i} onClick={() => { setInput(q); doAsk(q) }}
                        style={{
                          textAlign: 'left', fontSize: 14, color: '#64748b', background: '#f8fafc',
                          border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
                          padding: '12px 16px', width: '100%', transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--seal-sky)'; e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.background = 'var(--seal-ice)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = '#f8fafc' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Chat Messages */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {messages.map((m, i) => (
                    <div key={i} className="qa-fade" style={{ animationDelay: `${i * 0.05}s` }}>
                      {m.role === 'user' ? (
                        /* User bubble */
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div style={{
                            maxWidth: '80%', background: 'var(--seal-ice)', borderRadius: '16px 16px 4px 16px',
                            padding: '12px 18px', fontSize: 14, color: '#334155', lineHeight: 1.6,
                          }}>
                            {m.content}
                          </div>
                        </div>
                      ) : (
                        /* AI response */
                        <div style={{
                          background: m.isRejected ? '#FFFBEB' : '#fff',
                          borderRadius: 12,
                          border: m.isRejected ? '1px solid #FDE68A' : '1px solid #e2e8f0',
                          padding: '16px 20px',
                        }}>
                          {m.content ? renderMarkdown(m.content) : m.isRejected ? (
                            <div style={{
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                            }}>
                              <span style={{ fontSize: 18, flexShrink: 0 }}>!</span>
                              <span style={{ fontSize: 14, color: '#92400E', lineHeight: 1.6 }}>
                                {m.rejectionReason || '未找到与当前问题相关的课程资料'}
                              </span>
                            </div>
                          ) : m.progress ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: 'var(--seal-primary)', animation: 'thinking-dot 1.4s infinite ease-in-out both',
                              }} />
                              <span style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: 'var(--seal-primary)', animation: 'thinking-dot 1.4s 0.2s infinite ease-in-out both',
                              }} />
                              <span style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: 'var(--seal-primary)', animation: 'thinking-dot 1.4s 0.4s infinite ease-in-out both',
                              }} />
                              <span style={{ fontSize: 14, color: 'var(--seal-primary)', marginLeft: 4 }}>{m.progress}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                              未找到与当前问题相关的课程资料
                            </span>
                          )}

                          {/* Action Buttons */}
                          {m.content && (
                            <div style={{
                              display: 'flex', gap: 6, marginTop: 12, paddingTop: 12,
                              borderTop: '1px solid #f1f5f9',
                            }}>
                              <button onClick={() => handleCopy(m.content, i)} style={{ ...actionBtnStyle, position: 'relative' }}
                                onMouseEnter={(e) => { if (copiedIdx !== i) { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.borderColor = 'var(--seal-border)'; e.currentTarget.style.background = 'var(--seal-ice)' } }}
                                onMouseLeave={(e) => { if (copiedIdx !== i) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'none' } }}>
                                <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><rect x={5} y={5} width={9} height={9} rx={1} stroke="currentColor" strokeWidth={1.5} /><path d="M3 11V3h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                                {copiedIdx === i ? '已复制 ✓' : '复制'}
                              </button>
                              <button onClick={handleRegenerate} style={actionBtnStyle}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.borderColor = 'var(--seal-border)'; e.currentTarget.style.background = 'var(--seal-ice)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'none' }}>
                                <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0111.2-2.8M14 8a6 6 0 01-11.2 2.8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /><path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                重新生成
                              </button>
                              <button onClick={() => { setFeedbackError(''); setFeedbackModal(true) }} style={actionBtnStyle}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.borderColor = 'var(--seal-border)'; e.currentTarget.style.background = 'var(--seal-ice)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'none' }}>
                                <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><path d="M2 3h12l-1 9H3L2 3z" stroke="currentColor" strokeWidth={1.5} /><circle cx={12} cy={2} r={1.5} stroke="currentColor" strokeWidth={1.5} /><path d="M6 7v3M10 7v3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                                反馈
                              </button>
                            </div>
                          )}

                          {/* Sources */}
                          {m.sources && m.sources.length > 0 && (
                            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                                <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M4 3h8v10H4V3z" stroke="currentColor" strokeWidth={1.5} /><path d="M7 6h3M7 9h3M7 12h1" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                                参考来源 ({m.sources.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {m.sources.map((s, si) => {
                                  const isWeb = !!s.url
                                  return (
                                  <div key={si} onClick={() => openPreview(s)} style={{
                                    padding: '10px 12px 10px 16px', background: '#f8fafc',
                                    borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.5,
                                    borderLeft: isWeb ? '3px solid #F59E0B' : '3px solid var(--seal-primary)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                  }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = isWeb ? '#FFFBEB' : 'var(--seal-ice)'; e.currentTarget.style.borderLeftColor = isWeb ? '#D97706' : 'var(--seal-primary-hover)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderLeftColor = isWeb ? '#F59E0B' : 'var(--seal-primary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                          fontSize: 11, fontWeight: 600,
                                          color: isWeb ? '#D97706' : 'var(--seal-primary-hover)',
                                          background: isWeb ? '#FFFBEB' : 'var(--seal-ice)',
                                          padding: '2px 6px', borderRadius: 4, marginRight: 8,
                                        }}>
                                          {isWeb ? '网页' : '文档'} 来源 {si + 1}
                                        </span>
                                        <span style={{ fontWeight: 500, color: '#334155' }}>{s.title}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669', fontWeight: 500 }}>
                                          {Math.round(s.score * 100)}%
                                        </span>
                                        {isWeb && (
                                          <span title="在新窗口打开" style={{ fontSize: 13, opacity: 0.5 }}>↗</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {asking && (
                    <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
                      <span className="qa-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--seal-primary)' }} />
                      <span className="qa-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--seal-primary)' }} />
                      <span className="qa-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--seal-primary)' }} />
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* ====== Source Preview Panel ====== */}
          {previewSrc && (
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 420,
              background: '#fff', borderLeft: '1px solid #e2e8f0', zIndex: 20,
              display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, marginRight: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--seal-ice)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M4 3h8v10H4V3z" stroke="var(--seal-primary)" strokeWidth={1.5} /></svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {previewSrc.title}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      匹配度 {Math.round(previewSrc.score * 100)}%
                    </p>
                  </div>
                </div>
                <button onClick={() => { setPreviewSrc(null); setPreviewFileUrl(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
                  <svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>

              {/* Preview content */}
              <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {loadingPreview ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, paddingTop: 40 }}>加载中...</p>
                ) : previewFileUrl ? (
                  <iframe src={previewFileUrl} style={{
                    width: '100%', height: '100%', minHeight: 500,
                    border: '1px solid #e2e8f0', borderRadius: 8,
                  }} />
                ) : (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, paddingTop: 40 }}>
                    暂无法预览此文件
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                {previewFileUrl && (
                  <button onClick={() => window.open(previewFileUrl, '_blank')}
                    style={{
                      flex: 1, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                      color: '#fff', background: 'var(--seal-primary)', border: 'none', borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                      <path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth={1.5} />
                      <path d="M9 2v4h4" stroke="currentColor" strokeWidth={1.5} />
                    </svg>
                    新窗口打开
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ====== Bottom Input ====== */}
          <div style={{ borderTop: '1px solid #e2e8f0', background: '#fff', padding: '16px 0' }}>
            <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 24px' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 12,
                border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 8px 8px 16px',
                transition: 'border-color 0.2s',
                background: '#fff',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c7d2fe' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder="输入你的问题，Enter 发送，Shift+Enter 换行..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: 1, border: 'none', outline: 'none', resize: 'none',
                    fontSize: 14, color: '#0f172a', lineHeight: 1.5,
                    fontFamily: 'inherit', maxHeight: 120, padding: '4px 0',
                  }}
                />
                <button onClick={() => doAsk()} disabled={!input.trim() || asking}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() && !asking ? 'pointer' : 'default',
                    background: input.trim() && !asking ? 'var(--seal-primary)' : '#e2e8f0',
                    transition: 'all 0.2s', flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (input.trim() && !asking) e.currentTarget.style.background = 'var(--seal-primary-hover)' }}
                  onMouseLeave={(e) => { if (input.trim() && !asking) e.currentTarget.style.background = 'var(--seal-primary)' }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <path d="M2 2l12 6-12 6 3-6-3-6z" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', fontSize: 12, fontWeight: 500,
                    borderRadius: 14,
                    border: useWebSearch ? '1px solid var(--seal-primary)' : '1px solid #e2e8f0',
                    background: useWebSearch ? 'var(--seal-ice)' : '#fff',
                    color: useWebSearch ? 'var(--seal-primary-hover)' : '#94a3b8',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  title={useWebSearch ? '已开启联网搜索' : '未找到课程资料时自动联网搜索'}>
                  <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
                    <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={1.3} />
                    <ellipse cx={8} cy={8} rx={3} ry={6} stroke="currentColor" strokeWidth={1.3} />
                    <path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
                  </svg>
                  {useWebSearch ? '联网搜索已开启' : '联网搜索'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#cbd5e1', margin: '6px 0 0', textAlign: 'center' }}>
                EduRAG 基于课程资料回答，答案仅供参考
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Feedback Modal ====== */}
      {feedbackModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
              onClick={() => { setFeedbackModal(false); setFeedbackType(''); setFeedbackComment(''); setFeedbackError('') }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>反馈</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { type: 'useful', label: '👍 有用', color: '#059669', bg: '#ECFDF5' },
                { type: 'useless', label: '👎 无用', color: '#D97706', bg: '#FFFBEB' },
                { type: 'error', label: '⚠️ 有误', color: '#DC2626', bg: '#FEF2F2' },
              ].map((opt) => (
                <button key={opt.type} onClick={() => setFeedbackType(opt.type)}
                  style={{
                    flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                    border: feedbackType === opt.type ? `2px solid ${opt.color}` : '1px solid #e2e8f0',
                    background: feedbackType === opt.type ? opt.bg : '#fff',
                    color: feedbackType === opt.type ? opt.color : '#64748b',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{opt.label}</button>
              ))}
            </div>

            <textarea placeholder="补充说明（选填）..." value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)} rows={3}
              style={{
                width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px',
                fontSize: 13, color: '#334155', outline: 'none', resize: 'none', fontFamily: 'inherit', marginBottom: 16,
              }} />

            {feedbackError && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                {feedbackError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setFeedbackModal(false); setFeedbackType(''); setFeedbackComment(''); setFeedbackError('') }}
                style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, color: '#64748b', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
              <button onClick={submitFeedback} disabled={!feedbackType || feedbackSubmitting}
                style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: feedbackType ? 'pointer' : 'default', color: '#fff', background: feedbackType ? 'var(--seal-primary)' : '#c7d2fe' }}>
                {feedbackSubmitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', fontSize: 12, color: '#64748b',
  background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
  cursor: 'pointer', transition: 'all 0.15s',
}
