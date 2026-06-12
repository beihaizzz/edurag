import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface CourseItem { id: number; name: string }
interface QASourceItem { chunk_id: number; document_id: number; title: string; score: number }
interface QAItem { id: number; question: string; answer: string; sources: QASourceItem[] | null; is_rejected: boolean; latency_ms: number; course_id: number | null; created_at: string }

const css = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .qa-anim { animation: fadeInUp 0.4s ease-out both; }
  .qa-typing-dot { animation: pulse 1.2s ease-in-out infinite; }
  .qa-typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .qa-typing-dot:nth-child(3) { animation-delay: 0.4s; }
  .qa-snippet { position: relative; }
  .qa-snippet::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: #6366F1; border-radius: 3px 0 0 3px;
  }
`

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 0 ? '刚刚' : `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} 天前`
  return `${Math.floor(days / 7)} 周前`
}

function renderMarkdown(text: string) {
  // Simple markdown renderer for common patterns
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
    // Headings
    if (/^### (.+)/.test(line)) {
      flushList(); inList = false
      result.push(<h3 key={result.length} style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '16px 0 8px' }}>{line.replace(/^### /, '')}</h3>)
    } else if (/^## (.+)/.test(line)) {
      flushList(); inList = false
      result.push(<h2 key={result.length} style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '16px 0 8px' }}>{line.replace(/^## /, '')}</h2>)
    } else if (/^- (.+)/.test(line)) {
      inList = true
      const content = line.replace(/^- /, '')
      const bold = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      listItems.push(<li key={listItems.length} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: bold }} />)
    } else if (line.trim() === '') {
      if (inList) { flushList(); inList = false }
    } else if (/^> (.+)/.test(line)) {
      flushList(); inList = false
      result.push(
        <blockquote key={result.length} style={{
          borderLeft: '3px solid #818CF8', background: 'rgba(238,242,255,0.5)', borderRadius: '0 8px 8px 0',
          padding: '12px 16px', margin: '12px 0', fontSize: 13, color: '#475569',
        }}>
          {line.replace(/^> /, '')}
        </blockquote>
      )
    } else if (/^\d+\. (.+)/.test(line)) {
      flushList(); inList = false
      const m = line.match(/^(\d+)\. (.+)/)!
      result.push(
        <div key={result.length} style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{m[1]}</span>
          <span style={{ fontSize: 14, color: '#334155' }} dangerouslySetInnerHTML={{ __html: m[2].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      )
    } else if (line.trim()) {
      flushList(); inList = false
      result.push(<p key={result.length} style={{ margin: '4px 0', fontSize: 14, color: '#334155', lineHeight: 1.7 }}>{line}</p>)
    }
  }
  flushList()
  return result
}

const SUGGESTED_QUESTIONS = [
  '什么是进程调度？操作系统有哪些常见调度算法？',
  '高等数学中导数的几何意义是什么？',
  '数据结构中二叉树的遍历方式有哪些？',
  '大学物理电磁学部分的核心概念是什么？',
]

export default function QAPage() {
  const [searchParams] = useSearchParams()
  const [question, setQuestion] = useState(searchParams.get('question') || '')
  const [courseId, setCourseId] = useState('')
  const [asking, setAsking] = useState(false)
  const [currentQA, setCurrentQA] = useState<QAItem | null>(null)
  const [history, setHistory] = useState<QAItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [courses, setCourses] = useState<CourseItem[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  useEffect(() => { loadHistory(1) }, [])
  useEffect(() => {
    const q = searchParams.get('question')
    if (q) { setQuestion(q); askQuestion(q) }
  }, [])

  const loadHistory = async (p: number) => {
    try {
      const r = await api.get<APIResponse<PaginatedResponse<QAItem>>>('/qa', { params: { page: p, page_size: 20 } })
      if (r.data.code === 0 && r.data.data) {
        setHistory(r.data.data.items ?? [])
        setHistoryTotal(r.data.data.total)
        setHistoryPage(p)
      }
    } catch { /* */ }
  }

  const askQuestion = async (q?: string) => {
    const qq = (q || question).trim()
    if (!qq || asking) return
    setAsking(true)
    setCurrentQA(null)
    try {
      const body: Record<string, string | number> = { question: qq }
      if (courseId) body.course_id = Number(courseId)
      const r = await api.post<APIResponse<QAItem>>('/qa', body)
      if (r.data.code === 0 && r.data.data) {
        setCurrentQA(r.data.data)
        loadHistory(1)
      }
    } catch { /* */ }
    finally { setAsking(false); setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) }
  }

  const courseList = courses.length > 0 ? courses : [
    { id: 1, name: '大学物理' },{ id: 2, name: '高等数学' },{ id: 3, name: '程序设计' },
    { id: 4, name: '操作系统' },{ id: 5, name: '数据结构' },{ id: 6, name: '深度学习' },
    { id: 7, name: '软件工程' },{ id: 8, name: '数字图像处理' },{ id: 9, name: 'Unity开发' },
  ]

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 24 }}>

          {/* Main */}
          <div>
            <div className="qa-anim" style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>AI 课程问答</h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>基于课程资料智能问答，AI 回答将引用相关文档片段作为参考</p>
            </div>

            {/* Input */}
            <div className="qa-anim" style={{ animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 24 }}>
              <textarea
                rows={3} placeholder="输入你的问题，例如：什么是进程调度？操作系统有哪些常见算法？"
                value={question} onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); askQuestion() } }}
                style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: '#0f172a', lineHeight: 1.6, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                    style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
                    <option value="">全部课程</option>
                    {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Ctrl+Enter 发送</span>
                </div>
                <button onClick={() => askQuestion()} disabled={asking}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: asking ? '#a5b4fc' : '#6366F1', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: asking ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { if (!asking) { e.currentTarget.style.background = '#4F46E5'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)' } }}
                  onMouseLeave={(e) => { if (!asking) { e.currentTarget.style.background = '#6366F1'; e.currentTarget.style.boxShadow = 'none' } }}
                >
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M1 15L15 8 1 1v5.5L10 8 1 9.5V15z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  发送
                </button>
              </div>
            </div>

            {/* QA Display */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Question bubble */}
              {currentQA && (
                <div className="qa-anim" style={{ animationDelay: '0.1s', display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '85%', background: '#EEF2FF', borderRadius: '16px 16px 4px 16px', padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={5.5} r={2.5} stroke="#6366F1" strokeWidth={1.5} /><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" /></svg>
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#4F46E5' }}>你的问题</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, margin: 0 }}>{currentQA.question}</p>
                  </div>
                </div>
              )}

              {/* AI Answer Card */}
              {currentQA && !currentQA.is_rejected && (
                <div className="qa-anim" style={{ animationDelay: '0.15s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width={20} height={20} viewBox="0 0 20 20" fill="none"><rect x={4} y={5} width={12} height={10} rx={2} stroke="#6366F1" strokeWidth={1.5} /><path d="M8 8h4M8 11h3" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" /></svg>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>AI 回答</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6.5} stroke="currentColor" strokeWidth={1.5} /><path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                        {(currentQA.latency_ms / 1000).toFixed(1)}s
                      </span>
                      {currentQA.sources && currentQA.sources.length > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#EEF2FF', color: '#4F46E5', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><path d="M4 4h8v8H4V4zM8 4v8M4 8h8" stroke="currentColor" strokeWidth={1.5} /></svg>
                          {currentQA.sources.length} 个来源
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '20px 20px' }}>
                    <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                      {renderMarkdown(currentQA.answer)}
                    </div>

                    {/* Sources */}
                    {currentQA.sources && currentQA.sources.length > 0 && (
                      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                          <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M4 3h8v10H4V3z" stroke="currentColor" strokeWidth={1.5} /><path d="M7 6h3M7 9h3M7 12h1" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                          参考来源
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {currentQA.sources.map((s, si) => (
                            <div key={si} className="qa-snippet" style={{ padding: '10px 12px 10px 16px', background: '#f8fafc', borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', background: '#EEF2FF', padding: '2px 6px', borderRadius: 4, marginRight: 8 }}>来源 {si + 1}</span>
                                  <span style={{ fontWeight: 500, color: '#334155' }}>{s.title}</span>
                                </div>
                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669', fontWeight: 500, flexShrink: 0 }}>{Math.round(s.score * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rejected */}
              {currentQA && currentQA.is_rejected && (
                <div className="qa-anim" style={{ animationDelay: '0.15s', background: '#FFFBEB', borderRadius: 12, border: '1px solid #FDE68A', padding: 20, fontSize: 14, color: '#92400E' }}>
                  {currentQA.answer || '未找到与您问题相关的课程资料，请尝试其他关键词。'}
                </div>
              )}

              {/* Typing indicator */}
              {asking && (
                <div className="qa-anim" style={{ animationDelay: '0.15s', display: 'flex', gap: 6, padding: 16 }}>
                  <span className="qa-typing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366F1' }} />
                  <span className="qa-typing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366F1' }} />
                  <span className="qa-typing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366F1' }} />
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Suggested */}
            {!currentQA && !asking && (
              <div className="qa-anim" style={{ animationDelay: '0.2s', marginTop: 24, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6.5} stroke="#6366F1" strokeWidth={1.5} /><path d="M7.5 7.5h0M8 7.5v0" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" /></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>试试这些问题</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button key={i} onClick={() => { setQuestion(q); askQuestion(q) }}
                      style={{ textAlign: 'left', fontSize: 14, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', width: '100%' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#4F46E5' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b' }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* History Sidebar */}
          <div className="qa-anim" style={{ animationDelay: '0.08s' }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', position: 'sticky', top: 96 }}>
              <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6.5} stroke="#6366F1" strokeWidth={1.5} /><path d="M8 4.5V8l3 2M4.5 8h7" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>问答历史</span>
                </div>
                <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 99 }}>{historyTotal}</span>
              </div>
              <div style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
                {history.map((item, i) => (
                  <div key={item.id}
                    onClick={() => { setQuestion(item.question); setCurrentQA(item); endRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                    style={{
                      padding: '12px 16px', cursor: 'pointer', transition: 'background 0.2s',
                      borderLeft: item.id === currentQA?.id ? '2px solid #6366F1' : '2px solid transparent',
                      background: item.id === currentQA?.id ? 'rgba(238,242,255,0.3)' : 'transparent',
                      borderBottom: i < history.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}
                    onMouseEnter={(e) => { if (item.id !== currentQA?.id) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { if (item.id !== currentQA?.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: item.id === currentQA?.id ? '#0f172a' : '#64748b', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.question}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6.5} stroke="currentColor" strokeWidth={1.5} /><path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                        {formatTime(item.created_at)}
                      </span>
                      {item.sources ? (
                        <span style={{ fontSize: 10, background: '#EEF2FF', color: '#4F46E5', padding: '1px 4px', borderRadius: 4 }}>{item.sources.length} 来源</span>
                      ) : (
                        <span style={{ fontSize: 10, background: '#FFFBEB', color: '#D97706', padding: '1px 4px', borderRadius: 4 }}>未回答</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {historyTotal > history.length && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                  <button onClick={() => loadHistory(historyPage + 1)}
                    style={{ fontSize: 12, color: '#4F46E5', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
                    加载更多
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
