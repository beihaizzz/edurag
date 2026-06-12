import { useState, useEffect } from 'react'
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
  .qh-anim { animation: fadeInUp 0.4s ease-out both; }
  .qh-snippet { position: relative; }
  .qh-snippet::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: #6366F1; border-radius: 3px 0 0 3px;
  }
  .qh-answer-body {
    max-height: 0; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease; opacity: 0;
  }
  .qh-answer-body.open {
    max-height: 800px; opacity: 1; margin-top: 0;
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

export default function QAHistory() {
  const [items, setItems] = useState<QAItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [courseId, setCourseId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [courses, setCourses] = useState<CourseItem[]>([])

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  const load = async (p: number) => {
    try {
      const params: Record<string, string | number> = { page: p, page_size: 10 }
      if (courseId) params.course_id = Number(courseId)
      const r = await api.get<APIResponse<PaginatedResponse<QAItem>>>('/qa', { params })
      if (r.data.code === 0 && r.data.data) {
        const newItems = r.data.data.items ?? []
        setItems(p === 1 ? newItems : [...items, ...newItems])
        setTotal(r.data.data.total)
        setPage(p)
        setHasMore(p < r.data.data.total_pages)
      }
    } catch { /* */ }
  }

  useEffect(() => { load(1) }, [])
  useEffect(() => { setItems([]); load(1) }, [courseId])

  const loadMore = () => load(page + 1)

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = statusFilter
    ? items.filter((i) => (statusFilter === 'answered' ? !i.is_rejected : i.is_rejected))
    : items

  const courseList = courses.length > 0 ? courses : [
    { id: 1, name: '大学物理' },{ id: 2, name: '高等数学' },{ id: 3, name: '程序设计' },
    { id: 4, name: '操作系统' },{ id: 5, name: '数据结构' },{ id: 6, name: '深度学习' },
    { id: 7, name: '软件工程' },{ id: 8, name: '数字图像处理' },{ id: 9, name: 'Unity开发' },
  ]

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 896, margin: '0 auto', padding: '32px 24px' }}>

        <div className="qh-anim" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>问答历史</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              共 <span style={{ fontWeight: 600, color: '#334155' }}>{total}</span> 条问答记录
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
              <option value="">全部课程</option>
              {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
              <option value="">全部状态</option>
              <option value="answered">已回答</option>
              <option value="rejected">未回答</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((item, idx) => {
            const isOpen = expanded.has(item.id)
            return (
              <div key={item.id} className="qh-anim" style={{
                animationDelay: `${0.05 + idx * 0.05}s`,
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden',
              }}>
                {/* Header */}
                <div onClick={() => toggle(item.id)}
                  style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 16, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.5)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500,
                        background: item.is_rejected ? '#FFFBEB' : '#ECFDF5',
                        color: item.is_rejected ? '#D97706' : '#059669',
                      }}>
                        {item.is_rejected ? '未回答' : '已回答'}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatTime(item.created_at)}</span>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: item.is_rejected ? '#94a3b8' : '#1e293b', margin: 0 }}>
                      {item.question}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                      {item.sources && item.sources.length > 0 && (
                        <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><rect x={4} y={5} width={8} height={6} rx={1} stroke="currentColor" strokeWidth={1.5} /></svg>
                          {item.sources.length} 个来源
                        </span>
                      )}
                      {!item.is_rejected && (
                        <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6.5} stroke="currentColor" strokeWidth={1.5} /><path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                          {(item.latency_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      {item.is_rejected && (
                        <span style={{ fontSize: 11, color: '#D97706' }}>AI 无法基于现有资料回答该问题</span>
                      )}
                    </div>
                  </div>
                  {!item.is_rejected && (
                    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{
                      color: '#cbd5e1', flexShrink: 0, marginTop: 4,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>
                      <path d="M7 8l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {item.is_rejected && (
                    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 4 }}>
                      <path d="M10 17.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" stroke="currentColor" strokeWidth={1.5} />
                      <path d="M10 7v3.5M10 13.5h0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Expanded Answer */}
                {!item.is_rejected && (
                  <div className={`qh-answer-body ${isOpen ? 'open' : ''}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ padding: 20 }}>
                      {/* Question bubble */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                        <div style={{ maxWidth: '85%', background: '#EEF2FF', borderRadius: '12px 12px 4px 12px', padding: '12px 16px' }}>
                          <p style={{ fontSize: 14, color: '#334155', margin: 0 }}>{item.question}</p>
                        </div>
                      </div>

                      {/* Answer */}
                      <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {item.answer}
                      </div>

                      {/* Sources */}
                      {item.sources && item.sources.length > 0 && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>参考来源</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {item.sources.map((s, si) => (
                              <div key={si} className="qh-snippet" style={{ padding: '8px 12px 8px 16px', background: '#f8fafc', borderRadius: '0 8px 8px 0', fontSize: 12, color: '#475569' }}>
                                <span style={{ fontWeight: 500, color: '#334155' }}>{s.title}</span> · 匹配度 {Math.round(s.score * 100)}%
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {items.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 48 }}>暂无问答记录</p>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <button onClick={loadMore}
              style={{ padding: '10px 32px', fontSize: 14, color: '#4F46E5', fontWeight: 500, border: '1px solid #C7D2FE', borderRadius: 8, background: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#818CF8' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#C7D2FE' }}>
              加载更多
            </button>
          </div>
        )}
      </main>
    </>
  )
}
