import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface SessionItem {
  id: number; thread_id: string; title: string; turn_count: number
  course_id: number | null; created_at: string | null; updated_at: string | null
}

interface SourceItem { chunk_id?: number; document_id?: number; title: string; score: number; url?: string }

type NodeKey = 'classify' | 'rewrite' | 'retrieve' | 'rerank' | 'generate' | 'review'
type NodeState = 'pending' | 'running' | 'done' | 'skipped'
interface NodeStep { key: NodeKey; label: string; state: NodeState; detail?: string }

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[] | null
  isRejected?: boolean
  rejectionReason?: string
  /** 实时管线节点状态。AI 流式时由 SSE 事件驱动 */
  steps?: NodeStep[]
  /** 是否仍在生成中 */
  streaming?: boolean
}

interface SessionDetail {
  id: number; thread_id: string; title: string; turn_count: number
  course_id: number | null; chat_history: ChatMessage[]
  created_at: string | null; updated_at: string | null
}

const SUGGESTED_QUESTIONS = [
  '什么是进程调度？操作系统有哪些常见调度算法？',
  '高等数学中导数的几何意义是什么？',
  '数据结构中二叉树的遍历方式有哪些？',
  '大学物理电磁学部分的核心概念是什么？',
]

// ============================================================
// 管线节点定义（与后端 SSE 事件对齐）
// ============================================================
const NODE_LABELS: Record<NodeKey, string> = {
  classify: '识别问题意图',
  rewrite: '结合上下文理解',
  retrieve: '检索参考资料',
  rerank: '重排相关性',
  generate: '生成回答',
  review: '审核回答质量',
}

function makeInitialSteps(): NodeStep[] {
  return (Object.keys(NODE_LABELS) as NodeKey[]).map((k) => ({
    key: k, label: NODE_LABELS[k], state: 'pending',
  }))
}

function advanceSteps(steps: NodeStep[], currentKey: NodeKey, detail?: string): NodeStep[] {
  const idx = steps.findIndex((s) => s.key === currentKey)
  if (idx < 0) return steps
  return steps.map((s, i) => {
    if (i < idx && s.state !== 'done' && s.state !== 'skipped') return { ...s, state: 'done' }
    if (i === idx) return { ...s, state: 'running', detail: detail ?? s.detail }
    return s
  })
}

function skipStep(steps: NodeStep[], key: NodeKey, detail?: string): NodeStep[] {
  return steps.map((s) => s.key === key ? { ...s, state: 'skipped', detail } : s)
}

function finalizeSteps(steps: NodeStep[]): NodeStep[] {
  return steps.map((s) => s.state === 'pending' || s.state === 'running' ? { ...s, state: 'done' } : s)
}

// ============================================================
// 内联样式
// ============================================================
const css = `
  @keyframes qaFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes qaPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.5; } }
  @keyframes qaSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .qa-fade { animation: qaFadeIn 0.28s ease-out both; }

  /* ----- Scrollbar ----- */
  .qa-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .qa-scrollbar::-webkit-scrollbar-thumb { background: #d8e4ec; border-radius: 3px; }
  .qa-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--seal-sky); }
  .qa-scrollbar::-webkit-scrollbar-track { background: transparent; }

  /* ----- Session item ----- */
  .qa-session-item .qa-delete-btn { opacity: 0; }
  .qa-session-item:hover .qa-delete-btn { opacity: 1; }

  /* ----- Markdown body ----- */
  .qa-md { font-size: 14.5px; line-height: 1.72; color: #1f2937; word-break: break-word; }
  .qa-md > *:first-child { margin-top: 0; }
  .qa-md > *:last-child { margin-bottom: 0; }
  .qa-md p { margin: 0 0 12px; }
  .qa-md h1, .qa-md h2, .qa-md h3, .qa-md h4 { font-weight: 700; color: #0f172a; line-height: 1.4; margin: 20px 0 10px; letter-spacing: -0.01em; }
  .qa-md h1 { font-size: 20px; padding-bottom: 6px; border-bottom: 1px solid #e6eef5; }
  .qa-md h2 { font-size: 17px; }
  .qa-md h3 { font-size: 15.5px; }
  .qa-md h4 { font-size: 14.5px; color: #334155; }
  .qa-md ul, .qa-md ol { margin: 8px 0 14px; padding-left: 22px; }
  .qa-md li { margin: 4px 0; }
  .qa-md li > p { margin: 0; }
  .qa-md ul li::marker { color: var(--seal-sky); }
  .qa-md ol li::marker { color: var(--seal-primary); font-weight: 600; }
  .qa-md strong { color: #0f172a; font-weight: 700; }
  .qa-md em { color: #334155; }
  .qa-md a { color: var(--seal-primary); text-decoration: none; border-bottom: 1px solid rgba(47,128,183,0.3); }
  .qa-md a:hover { color: var(--seal-primary-hover); border-bottom-color: var(--seal-primary-hover); }
  .qa-md blockquote {
    margin: 12px 0; padding: 10px 16px;
    border-left: 3px solid var(--seal-sky);
    background: linear-gradient(90deg, rgba(232,245,251,0.6), transparent);
    border-radius: 0 8px 8px 0; color: #475569; font-size: 14px;
  }
  .qa-md blockquote p { margin: 0; }
  .qa-md code {
    font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.88em; padding: 1.5px 6px; border-radius: 4px;
    background: #f1f5f9; color: #be185d; border: 1px solid #e2e8f0;
  }
  .qa-md pre {
    margin: 12px 0; padding: 14px 16px; border-radius: 10px;
    background: #0f172a; color: #e2e8f0; overflow-x: auto;
    font-size: 13px; line-height: 1.6;
    border: 1px solid #1e293b;
  }
  .qa-md pre code {
    background: transparent; color: inherit; border: none; padding: 0; font-size: inherit;
  }
  .qa-md table {
    border-collapse: collapse; margin: 12px 0; width: 100%;
    font-size: 13.5px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
  }
  .qa-md th, .qa-md td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  .qa-md th { background: #f8fafc; font-weight: 600; color: #0f172a; }
  .qa-md tr:nth-child(even) td { background: #fafbfc; }
  .qa-md hr { border: none; border-top: 1px solid #e6eef5; margin: 18px 0; }
  .qa-md img { max-width: 100%; border-radius: 8px; margin: 8px 0; }

  /* ----- Source ref tag inside markdown ----- */
  .qa-cite {
    display: inline-flex; align-items: center; gap: 2px;
    font-size: 11px; padding: 1px 6px; margin: 0 2px;
    border-radius: 4px; font-weight: 600;
    background: var(--seal-ice); color: var(--seal-primary-hover);
    vertical-align: 1px;
  }

  /* ----- Reasoning box (collapsible) ----- */
  .qa-reasoning {
    border: 1px solid var(--seal-border);
    background: linear-gradient(180deg, rgba(232,245,251,0.4) 0%, rgba(248,252,255,0.6) 100%);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .qa-reasoning:hover { border-color: var(--seal-sky); }
  .qa-reasoning-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }
  .qa-reasoning-header:hover { background: rgba(232,245,251,0.5); }
  .qa-reasoning-icon {
    width: 14px; height: 14px; flex-shrink: 0;
    color: var(--seal-primary);
    display: flex; align-items: center; justify-content: center;
  }
  .qa-reasoning-icon.spin { animation: qaSpin 1.4s linear infinite; }
  .qa-reasoning-title {
    font-size: 12.5px; font-weight: 600;
    color: var(--seal-ink);
    letter-spacing: 0.01em;
  }
  .qa-reasoning-meta {
    font-size: 11.5px; color: var(--seal-muted); font-weight: 400;
    margin-left: 2px;
  }
  .qa-reasoning-chevron {
    margin-left: auto; flex-shrink: 0;
    color: var(--seal-muted);
    transition: transform 0.25s ease;
  }
  .qa-reasoning.expanded .qa-reasoning-chevron { transform: rotate(180deg); }
  .qa-reasoning-body {
    max-height: 0; opacity: 0;
    overflow: hidden;
    transition: max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.25s ease;
    padding: 0 14px;
  }
  .qa-reasoning.expanded .qa-reasoning-body {
    max-height: 600px; opacity: 1;
    padding: 4px 14px 12px;
  }

  /* ----- Step list ----- */
  .qa-steps { position: relative; padding-left: 6px; }
  .qa-steps::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 10px; bottom: 10px;
    width: 1px;
    background: linear-gradient(180deg, var(--seal-border) 0%, rgba(207,231,244,0.4) 100%);
  }
  .qa-step {
    display: flex; align-items: center; gap: 12px;
    padding: 5px 0;
    font-size: 12.5px;
    position: relative;
    z-index: 1;
  }
  .qa-step-dot {
    width: 12px; height: 12px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: #fff;
    border: 1.5px solid var(--seal-border);
    transition: all 0.2s;
  }
  .qa-step-pending .qa-step-dot { background: #fff; border-color: #d8e4ec; }
  .qa-step-running .qa-step-dot {
    background: var(--seal-primary);
    border-color: var(--seal-primary);
    box-shadow: 0 0 0 3px rgba(47,128,183,0.18);
  }
  .qa-step-running .qa-step-dot::after {
    content: '';
    width: 4px; height: 4px; border-radius: 50%;
    background: #fff;
    animation: qaPulse 1.3s ease-in-out infinite;
  }
  .qa-step-done .qa-step-dot {
    background: var(--seal-primary);
    border-color: var(--seal-primary);
  }
  .qa-step-skipped .qa-step-dot {
    background: #fff;
    border-color: #cfd9e2;
    border-style: dashed;
  }
  .qa-step-label { color: #475569; transition: color 0.2s; font-weight: 400; }
  .qa-step-running .qa-step-label { color: var(--seal-primary-hover); font-weight: 600; }
  .qa-step-done .qa-step-label { color: var(--seal-ink); }
  .qa-step-pending .qa-step-label { color: #b0bec8; }
  .qa-step-skipped .qa-step-label { color: #b0bec8; }
  .qa-step-detail {
    margin-left: 4px;
    font-size: 11.5px;
    color: var(--seal-muted);
    font-weight: 400;
  }

  /* ----- Input ----- */
  .qa-input-shell {
    background: #fff;
    border: 1px solid #dde6ee;
    border-radius: 26px;
    padding: 10px 12px 10px 20px;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }
  .qa-input-shell:focus-within {
    border-color: var(--seal-sky);
    box-shadow: 0 0 0 4px rgba(111,182,220,0.18);
  }
  .qa-input-shell textarea {
    width: 100%; border: none; outline: none; resize: none;
    font-size: 15px; color: #0f172a; line-height: 1.55;
    font-family: inherit; max-height: 200px; background: transparent;
    padding: 6px 0;
  }
  .qa-input-shell textarea::placeholder { color: #94a3b8; }
  .qa-send-btn {
    width: 34px; height: 34px; border-radius: 50%; border: none;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.18s; flex-shrink: 0;
  }
  .qa-send-btn.active { background: #0f172a; cursor: pointer; }
  .qa-send-btn.active:hover { background: var(--seal-ink); transform: scale(1.05); }
  .qa-send-btn.idle { background: #e2e8f0; cursor: not-allowed; }
  .qa-send-btn.stop { background: #dc2626; cursor: pointer; }
  .qa-tool-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; font-size: 12.5px; font-weight: 500;
    border-radius: 14px; cursor: pointer; transition: all 0.18s;
    background: #fff; border: 1px solid #dde6ee; color: #64748b;
  }
  .qa-tool-chip:hover { border-color: var(--seal-sky); color: var(--seal-primary-hover); }
  .qa-tool-chip.active {
    background: var(--seal-ice); border-color: var(--seal-sky);
    color: var(--seal-primary-hover);
  }
`

// ============================================================
// 子组件
// ============================================================

/** 推理过程：可折叠卡片，header 显示当前/总结状态，body 是 step list */
function ReasoningBox({
  steps,
  streaming,
  expanded,
  onToggle,
}: {
  steps: NodeStep[]
  streaming: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const doneCount = steps.filter((s) => s.state === 'done').length
  const totalActive = steps.filter((s) => s.state !== 'skipped').length
  const runningStep = steps.find((s) => s.state === 'running')

  let summary: React.ReactNode
  if (streaming) {
    if (runningStep) {
      summary = (
        <>
          <span className="qa-reasoning-title">{runningStep.label}</span>
          {runningStep.detail && (
            <span className="qa-reasoning-meta">· {runningStep.detail}</span>
          )}
        </>
      )
    } else {
      summary = <span className="qa-reasoning-title">正在思考</span>
    }
  } else {
    summary = (
      <>
        <span className="qa-reasoning-title">推理过程</span>
        <span className="qa-reasoning-meta">已完成 {doneCount}/{totalActive} 步</span>
      </>
    )
  }

  return (
    <div className={`qa-reasoning ${expanded ? 'expanded' : ''}`}>
      <div className="qa-reasoning-header" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}>
        <span className={`qa-reasoning-icon ${streaming ? 'spin' : ''}`}>
          {streaming ? (
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              <circle cx={7} cy={7} r={5.5} stroke="currentColor" strokeWidth={1.6} opacity={0.25} />
            </svg>
          ) : (
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <path d="M7 1.2a2.8 2.8 0 012.8 2.8c0 1.1-.6 2-1.5 2.5 1 .6 1.8 1.7 1.8 3.1 0 .5-.4.9-.9.9H4.8a.9.9 0 01-.9-.9c0-1.4.8-2.5 1.8-3.1A2.8 2.8 0 014.2 4 2.8 2.8 0 017 1.2z"
                stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
              <path d="M5.3 12.5h3.4" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
            </svg>
          )}
        </span>
        {summary}
        <span className="qa-reasoning-chevron">
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="qa-reasoning-body">
        <div className="qa-steps">
          {steps.map((s) => (
            <div key={s.key} className={`qa-step qa-step-${s.state}`}>
              <span className="qa-step-dot" />
              <span className="qa-step-label">{s.label}</span>
              {s.detail && (s.state === 'running' || s.state === 'done' || s.state === 'skipped') && (
                <span className="qa-step-detail">· {s.detail}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SealAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #eaf3fa, #cfe7f4)',
      border: '1.5px solid #fff',
      boxShadow: '0 2px 6px rgba(47,128,183,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', position: 'relative',
      animation: thinking ? 'qaPulse 2s ease-in-out infinite' : undefined,
    }}>
      <img src="/seal-no-eyes.png" alt="AI"
        style={{ width: 24, height: 24, objectFit: 'contain' }}
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).src = '/seal-logo-transparent.png'
        }} />
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
export default function QAPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<{ docId?: number; title: string; score: number } | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [lastQuestion, setLastQuestion] = useState('')
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState(false)
  const [feedbackType, setFeedbackType] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  /** 控制每条 AI 消息的推理框折叠/展开。
   *  undefined → 跟随 streaming：流式中展开，完成后折叠。
   *  true → 用户手动折叠。false → 用户手动展开。 */
  const [collapsedTimelines, setCollapsedTimelines] = useState<Record<number, boolean>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const r = await api.get<APIResponse<PaginatedResponse<SessionItem>>>('/qa/sessions', { params: { page: 1, page_size: 50 } })
      if (r.data.code === 0 && r.data.data) {
        setSessions(r.data.data.items ?? [])
      }
    } catch (e) { console.error('加载会话列表失败', e) }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const loadSession = useCallback(async (sessionId: number) => {
    setLoadingSession(true)
    try {
      const r = await api.get<APIResponse<SessionDetail>>(`/qa/sessions/${sessionId}`)
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data
        setActiveThreadId(d.thread_id)
        setActiveSessionId(d.id)
        // 历史消息的推理 steps 没持久化（后端 chat_history 只存 role/content/sources/is_rejected）。
        // 为每条 assistant 消息合成一个"全部完成"的 steps 骨架，让推理框在刷新后仍存在：
        // - 有 sources → grounded 路径
        // - 无 sources 且非 reject → fallback 路径（基于 AI 知识）
        // - is_rejected → 无需 steps
        setMessages(d.chat_history.map((m) => {
          if (m.role !== 'assistant' || m.isRejected) return m
          if (m.steps && m.steps.length > 0) return m  // 兜底：若未来后端持久化了 steps
          const hasSources = !!m.sources && m.sources.length > 0
          const steps: NodeStep[] = makeInitialSteps().map((s) => {
            if (s.key === 'rewrite') {
              // 历史回放无法区分 rewrite 是否实际触发，统一标 done（不显示 detail）
              return { ...s, state: 'done' as NodeState }
            }
            if (s.key === 'retrieve') {
              return {
                ...s,
                state: 'done' as NodeState,
                detail: hasSources ? `命中课程资料 ${m.sources!.length} 条` : '无相关资料',
              }
            }
            if (s.key === 'rerank') {
              return {
                ...s,
                state: 'done' as NodeState,
                detail: hasSources ? undefined : '无相关结果',
              }
            }
            if (s.key === 'generate') {
              return {
                ...s,
                state: 'done' as NodeState,
                detail: hasSources ? undefined : '基于 AI 知识',
              }
            }
            return { ...s, state: 'done' as NodeState }
          })
          return { ...m, steps, streaming: false }
        }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  const getToken = (): string | null => {
    try {
      const raw = localStorage.getItem('auth-storage')
      if (!raw) return null
      return JSON.parse(raw)?.state?.token ?? null
    } catch { return null }
  }

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const placeholder: ChatMessage = {
        role: 'assistant',
        content: '',
        streaming: true,
        steps: makeInitialSteps(),
      }
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
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
            continue
          }
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          let payload: Record<string, unknown>
          try { payload = JSON.parse(jsonStr) } catch { continue }

          const updateMsg = (fn: (prev: ChatMessage) => Partial<ChatMessage>) => {
            setMessages((prev) => {
              const next = [...prev]
              if (next[aiIdx]) next[aiIdx] = { ...next[aiIdx], ...fn(next[aiIdx]) }
              return next
            })
          }
          const advance = (key: NodeKey, detail?: string) => {
            updateMsg((prev) => ({ steps: advanceSteps(prev.steps ?? makeInitialSteps(), key, detail) }))
          }
          const skip = (key: NodeKey, detail?: string) => {
            updateMsg((prev) => ({ steps: skipStep(prev.steps ?? makeInitialSteps(), key, detail) }))
          }

          switch (currentEvent) {
            case 'classify':
              advance('classify')
              break

            case 'rewrite': {
              const wasRewritten = payload.was_rewritten as boolean
              if (wasRewritten) advance('rewrite')
              else skip('rewrite', '无需改写')
              break
            }

            case 'retrieve': {
              const src = payload.source === 'web' ? '网络' : '课程'
              const hasResults = payload.has_results as boolean
              const count = payload.count as number | undefined
              const detail = hasResults
                ? `命中 ${src}资料${count ? ` ${count} 条` : ''}`
                : `未命中 ${src}资料`
              advance('retrieve', detail)
              break
            }

            case 'rerank': {
              // Rerank 用 cross-encoder 做二次过滤，output_count=0 表示
              // 之前 prefilter 的"命中"其实不相关 → 回填修正 retrieve 的状态
              // 否则用户会看到"命中课程资料"+"基于 AI 知识"的矛盾
              const outCount = payload.output_count as number | undefined
              const inCount = payload.input_count as number | undefined
              if (typeof outCount === 'number' && outCount === 0) {
                updateMsg((prev) => {
                  const steps = (prev.steps ?? makeInitialSteps()).map((s) =>
                    s.key === 'retrieve'
                      ? { ...s, detail: '未命中相关资料' }
                      : s,
                  )
                  return { steps: advanceSteps(steps, 'rerank', '无相关结果') }
                })
              } else {
                const detail = (typeof inCount === 'number' && typeof outCount === 'number')
                  ? `保留 ${outCount}/${inCount} 条`
                  : undefined
                advance('rerank', detail)
              }
              break
            }

            case 'generate': {
              const len = payload.length as number | undefined
              const usedFallback = payload.used_fallback as boolean | undefined
              let detail: string | undefined
              if (usedFallback) {
                // 后端 fallback：retrieve 阶段虽然有原始命中，但 rerank 已过滤为 0
                // 或被判定为 stranded follow-up，最终用 AI 知识作答。前端需把
                // retrieve 的 "命中课程资料" 改写成 "无相关资料"，避免与下方
                // "基于 AI 知识" 矛盾。
                updateMsg((prev) => ({
                  steps: (prev.steps ?? makeInitialSteps()).map((s) =>
                    s.key === 'retrieve' && (s.state === 'done' || s.state === 'running')
                      ? { ...s, detail: '无相关资料' }
                      : s,
                  ),
                }))
                detail = '基于 AI 知识'
              } else if (len) {
                detail = `已生成 ${len} 字`
              }
              advance('generate', detail)
              break
            }

            case 'review':
              advance('review')
              break

            case 'reject': {
              const reason = (payload.reason as string) ||
                (payload.intent ? `问题意图被拒绝：${payload.intent}` : '无法处理该请求')
              updateMsg((prev) => ({
                content: '',
                streaming: false,
                steps: finalizeSteps(prev.steps ?? []),
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

              if (threadId && !activeThreadId) setActiveThreadId(threadId)
              if (typeof payload.session_id === 'number') setActiveSessionId(payload.session_id)
              if (searchParams.get('question')) setSearchParams({}, { replace: true })

              updateMsg((prev) => ({
                content: answer,
                streaming: false,
                steps: finalizeSteps(prev.steps ?? []),
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
              updateMsg((prev) => ({
                content: '',
                streaming: false,
                steps: finalizeSteps(prev.steps ?? []),
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

  const handleStop = () => {
    abortRef.current?.abort()
    setAsking(false)
  }

  const openPreview = async (src: SourceItem) => {
    if (src.url) {
      window.open(src.url, '_blank')
      return
    }
    if (!src.document_id) return
    setPreviewSrc({ docId: src.document_id, title: src.title, score: src.score })
    setLoadingPreview(true)
    setPreviewFileUrl(null)
    try {
      const r = await api.get(`/documents/${src.document_id}/file`, { responseType: 'blob' })
      setPreviewFileUrl(URL.createObjectURL(r.data as Blob))
    } catch { /* */ }
    finally { setLoadingPreview(false) }
  }

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    }).catch(() => {})
  }

  const handleRegenerate = () => {
    if (!lastQuestion || asking) return
    setMessages((prev) => {
      const next = [...prev]
      if (next.length && next[next.length - 1].role === 'assistant') next.pop()
      if (next.length && next[next.length - 1].role === 'user') next.pop()
      return next
    })
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
    abortRef.current?.abort()
    setAsking(false)
    setActiveThreadId(null)
    setActiveSessionId(null)
    setMessages([])
    setInput('')
    setLastQuestion('')
    setPreviewSrc(null)
    setPreviewFileUrl(null)
    setCollapsedTimelines({})
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

  /** 为 react-markdown 自定义节点：把 [来源N] 渲染成 chip */
  const mdComponents = {
    p: ({ children, ...props }: { children?: React.ReactNode } & React.HTMLAttributes<HTMLParagraphElement>) => {
      return <p {...props}>{renderInlineCitations(children)}</p>
    },
    li: ({ children, ...props }: { children?: React.ReactNode } & React.HTMLAttributes<HTMLLIElement>) => {
      return <li {...props}>{renderInlineCitations(children)}</li>
    },
  }

  return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#fafbfc' }}>
        {/* ====== Left Sidebar ====== */}
        <div style={{
          width: 248, flexShrink: 0, borderRight: '1px solid #e6eef5',
          display: 'flex', flexDirection: 'column', background: '#f7fafc',
        }}>
          <div style={{ padding: '16px 14px 12px' }}>
            <button onClick={newChat}
              style={{
                width: '100%', padding: '10px 16px', fontSize: 13.5, fontWeight: 600,
                border: '1px solid #dde6ee', borderRadius: 10, background: '#fff',
                color: '#334155', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--seal-sky)'; e.currentTarget.style.color = 'var(--seal-primary-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#dde6ee'; e.currentTarget.style.color = '#334155' }}>
              <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
              新对话
            </button>
          </div>

          <div style={{ padding: '0 16px 8px', fontSize: 11.5, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em' }}>
            历史对话
          </div>

          <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
            {sessions.map((s) => (
              <div key={s.id} className="qa-session-item"
                onClick={() => loadSession(s.id)}
                style={{
                  padding: '10px 12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer',
                  background: s.id === activeSessionId ? '#fff' : 'transparent',
                  border: s.id === activeSessionId ? '1px solid #dde6ee' : '1px solid transparent',
                  boxShadow: s.id === activeSessionId ? '0 1px 2px rgba(15,23,42,0.04)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = '#eef3f7' }}
                onMouseLeave={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 500, color: s.id === activeSessionId ? '#0f172a' : '#334155',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
                  }}>
                    {s.title}
                  </p>
                  <button className="qa-delete-btn" onClick={(e) => deleteSession(e, s.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1',
                      padding: 2, flexShrink: 0, transition: 'opacity 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1' }}>
                    <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                      <path d="M4 4h8M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  {s.turn_count} 轮 · {formatTime(s.updated_at)}
                </p>
              </div>
            ))}

            {sessions.length === 0 && (
              <p style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>
                暂无对话记录，开始新对话吧
              </p>
            )}
          </div>
        </div>

        {/* ====== Main Chat Area ====== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', background: '#fff' }}>
          {/* Messages */}
          <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px 0 40px' }}>
            <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 20px' }}>
              {loadingSession ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>加载中...</div>
              ) : messages.length === 0 && !asking ? (
                /* Welcome */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 96 }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 24,
                    background: 'linear-gradient(135deg, #eaf3fa 0%, #cfe7f4 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
                    boxShadow: '0 8px 24px rgba(47,128,183,0.18)',
                  }}>
                    <img src="/seal-no-eyes.png" alt="EduRAG"
                      style={{ width: 64, height: 64, objectFit: 'contain' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/seal-logo-transparent.png' }} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.01em' }}>有什么可以帮你？</h2>
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 40px', textAlign: 'center', maxWidth: 460 }}>
                    基于课程资料为你解答，支持多轮追问和联网补充
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button key={i} onClick={() => { setInput(q); doAsk(q) }}
                        style={{
                          textAlign: 'left', fontSize: 13.5, color: '#475569', background: '#fff',
                          border: '1px solid #e6eef5', borderRadius: 12, cursor: 'pointer',
                          padding: '14px 16px', transition: 'all 0.2s', lineHeight: 1.5,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--seal-sky)'; e.currentTarget.style.background = 'var(--seal-ice)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(47,128,183,0.08)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e6eef5'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Chat Messages */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {messages.map((m, i) => (
                    <div key={i} className="qa-fade" style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
                      {m.role === 'user' ? (
                        /* User bubble — OpenAI style: fit-content, max 72%, no border */
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div style={{
                            maxWidth: '72%',
                            background: 'var(--seal-ice)',
                            borderRadius: 18,
                            padding: '10px 16px', fontSize: 14.5, color: '#0f172a', lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {m.content}
                          </div>
                        </div>
                      ) : (
                        /* AI response — flat layout, tight gutter */
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <SealAvatar thinking={m.streaming} />
                          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                            <div style={{
                              background: m.isRejected ? '#FFFBEB' : 'transparent',
                              borderRadius: m.isRejected ? 12 : 0,
                              border: m.isRejected ? '1px solid #FDE68A' : 'none',
                              padding: m.isRejected ? '12px 16px' : 0,
                            }}>
                              {/* 推理过程：可折叠卡片。streaming 中默认展开，完成后默认折叠 */}
                              {m.steps && m.steps.length > 0 && (
                                <div style={{ marginBottom: m.content || m.isRejected ? 14 : 0 }}>
                                  <ReasoningBox
                                    steps={m.steps}
                                    streaming={Boolean(m.streaming)}
                                    expanded={
                                      collapsedTimelines[i] === undefined
                                        ? Boolean(m.streaming)
                                        : !collapsedTimelines[i]
                                    }
                                    onToggle={() => setCollapsedTimelines((prev) => {
                                      const currentlyExpanded = prev[i] === undefined
                                        ? Boolean(m.streaming)
                                        : !prev[i]
                                      return { ...prev, [i]: currentlyExpanded }
                                    })}
                                  />
                                </div>
                              )}

                              {/* 内容 */}
                              {m.content ? (
                                <div className="qa-md">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
                              ) : m.isRejected ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                  <span style={{
                                    flexShrink: 0, fontSize: 12, fontWeight: 700,
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: '#FBBF24', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>!</span>
                                  <span style={{ fontSize: 14, color: '#92400E', lineHeight: 1.6 }}>
                                    {m.rejectionReason || '未找到与当前问题相关的课程资料'}
                                  </span>
                                </div>
                              ) : !m.steps?.length ? (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 13.5 }}>
                                  未找到与当前问题相关的课程资料
                                </span>
                              ) : null}

                              {/* Action Buttons */}
                              {m.content && (
                                <div style={{
                                  display: 'flex', gap: 4, marginTop: 10,
                                  marginLeft: -8,
                                }}>
                                  <button onClick={() => handleCopy(m.content, i)} style={actionBtnStyle}
                                    onMouseEnter={(e) => { if (copiedIdx !== i) { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.background = 'var(--seal-ice)' } }}
                                    onMouseLeave={(e) => { if (copiedIdx !== i) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent' } }}>
                                    <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><rect x={5} y={5} width={9} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.5} /><path d="M3 11V3.5A0.5 0.5 0 013.5 3H11" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                                    {copiedIdx === i ? '已复制' : '复制'}
                                  </button>
                                  <button onClick={handleRegenerate} style={actionBtnStyle}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.background = 'var(--seal-ice)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent' }}>
                                    <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0111.2-2.8M14 8a6 6 0 01-11.2 2.8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /><path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    重新生成
                                  </button>
                                  <button onClick={() => { setFeedbackError(''); setFeedbackModal(true) }} style={actionBtnStyle}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--seal-primary-hover)'; e.currentTarget.style.background = 'var(--seal-ice)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent' }}>
                                    <svg width={13} height={13} viewBox="0 0 16 16" fill="none"><path d="M3 8.5l2.5 2.5L13 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    反馈
                                  </button>
                                </div>
                              )}

                              {/* Sources */}
                              {m.sources && m.sources.length > 0 && (
                                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e6eef5' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11.5, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.03em' }}>
                                    <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><path d="M4 3h8v10H4V3z" stroke="currentColor" strokeWidth={1.5} /><path d="M7 6h3M7 9h3M7 12h1" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                                    参考来源 · {m.sources.length}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {m.sources.map((s, si) => {
                                      const isWeb = !!s.url
                                      return (
                                        <div key={si} onClick={() => openPreview(s)} style={{
                                          padding: '10px 12px 10px 14px', background: '#fafbfc',
                                          borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                                          borderLeft: isWeb ? '3px solid #F59E0B' : '3px solid var(--seal-primary)',
                                          cursor: 'pointer', transition: 'all 0.18s',
                                          border: '1px solid #f1f5f9',
                                          borderLeftWidth: 3,
                                        }}
                                          onMouseEnter={(e) => { e.currentTarget.style.background = isWeb ? '#FFFBEB' : 'var(--seal-ice)' }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = '#fafbfc' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <span style={{
                                                fontSize: 10.5, fontWeight: 700,
                                                color: isWeb ? '#D97706' : 'var(--seal-primary-hover)',
                                                background: isWeb ? '#FFFBEB' : 'var(--seal-ice)',
                                                padding: '2px 6px', borderRadius: 4, marginRight: 8,
                                                letterSpacing: '0.02em',
                                              }}>
                                                {isWeb ? '🌐 网页' : '📄 文档'} {si + 1}
                                              </span>
                                              <span style={{ fontWeight: 500, color: '#334155', fontSize: 13 }}>{s.title}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                              <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669', fontWeight: 600 }}>
                                                {Math.round(s.score * 100)}%
                                              </span>
                                              {isWeb && <span title="新窗口打开" style={{ fontSize: 12, color: '#94a3b8' }}>↗</span>}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* ====== Source Preview Panel ====== */}
          {previewSrc && (
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 440,
              background: '#fff', borderLeft: '1px solid #e6eef5', zIndex: 20,
              display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(15,23,42,0.06)',
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid #e6eef5',
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

              <div className="qa-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {loadingPreview ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 40 }}>加载中...</p>
                ) : previewFileUrl ? (
                  <iframe src={previewFileUrl} style={{
                    width: '100%', height: '100%', minHeight: 500,
                    border: '1px solid #e6eef5', borderRadius: 8,
                  }} />
                ) : (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 40 }}>
                    暂无法预览此文件
                  </p>
                )}
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid #e6eef5', display: 'flex', gap: 8 }}>
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
          <div style={{ background: 'linear-gradient(180deg, transparent 0%, #fff 30%)', padding: '12px 0 20px' }}>
            <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 20px' }}>
              <div className="qa-input-shell">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    placeholder="输入你的问题 ··· (Enter 发送，Shift+Enter 换行)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  {asking ? (
                    <button onClick={handleStop} className="qa-send-btn stop" title="停止生成">
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                        <rect x={4} y={4} width={8} height={8} rx={1.5} fill="#fff" />
                      </svg>
                    </button>
                  ) : (
                    <button onClick={() => doAsk()} disabled={!input.trim()}
                      className={`qa-send-btn ${input.trim() ? 'active' : 'idle'}`}
                      title="发送">
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                        <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke={input.trim() ? '#fff' : '#94a3b8'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setUseWebSearch(!useWebSearch)}
                    className={`qa-tool-chip ${useWebSearch ? 'active' : ''}`}
                    title={useWebSearch ? '已开启联网搜索' : '未找到课程资料时自动联网搜索'}>
                    <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
                      <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={1.3} />
                      <ellipse cx={8} cy={8} rx={3} ry={6} stroke="currentColor" strokeWidth={1.3} />
                      <path d="M2 8h12" stroke="currentColor" strokeWidth={1.3} />
                    </svg>
                    {useWebSearch ? '联网搜索已开启' : '联网搜索'}
                  </button>
                  <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                    EduRAG 基于课程资料生成，仅供参考
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Feedback Modal ====== */}
      {feedbackModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={() => { setFeedbackModal(false); setFeedbackType(''); setFeedbackComment(''); setFeedbackError('') }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 24px 64px rgba(15,23,42,0.18)' }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>对本次回答的反馈</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { type: 'useful', label: '👍 有用', color: '#059669', bg: '#ECFDF5' },
                { type: 'useless', label: '👎 无用', color: '#D97706', bg: '#FFFBEB' },
                { type: 'error', label: '⚠️ 有误', color: '#DC2626', bg: '#FEF2F2' },
              ].map((opt) => (
                <button key={opt.type} onClick={() => setFeedbackType(opt.type)}
                  style={{
                    flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 500, borderRadius: 10,
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
                width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px',
                fontSize: 13, color: '#334155', outline: 'none', resize: 'none', fontFamily: 'inherit', marginBottom: 16,
              }} />

            {feedbackError && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                {feedbackError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setFeedbackModal(false); setFeedbackType(''); setFeedbackComment(''); setFeedbackError('') }}
                style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 500, color: '#64748b', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
              <button onClick={submitFeedback} disabled={!feedbackType || feedbackSubmitting}
                style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 600, borderRadius: 10, border: 'none', cursor: feedbackType ? 'pointer' : 'default', color: '#fff', background: feedbackType ? 'var(--seal-primary)' : '#c7d2fe' }}>
                {feedbackSubmitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// 工具：把 react-markdown 渲染后的子节点里 [来源N] 文本替换成 chip
// ============================================================
function renderInlineCitations(children: React.ReactNode): React.ReactNode {
  return walkAndReplace(children)
}

function walkAndReplace(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) {
    return node.map((c, i) => <React.Fragment key={i}>{walkAndReplace(c)}</React.Fragment>)
  }
  if (typeof node === 'string') {
    const re = /\[来源\d+\]/g
    if (!re.test(node)) return node
    re.lastIndex = 0
    const out: React.ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(node)) !== null) {
      if (m.index > last) out.push(node.slice(last, m.index))
      out.push(<span key={`c-${m.index}`} className="qa-cite">{m[0]}</span>)
      last = m.index + m[0].length
    }
    if (last < node.length) out.push(node.slice(last))
    return <>{out}</>
  }
  return node
}

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 11px', fontSize: 12, color: '#64748b',
  background: 'transparent', border: 'none', borderRadius: 7,
  cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500,
}
