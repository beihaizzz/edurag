import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface CourseItem { id: number; name: string }
interface SnippetItem { chunk_id: number; content: string; score: number }
interface ResultItem { document_id: number; title: string; file_type: string; course_name: string; matched_snippets: SnippetItem[] }

const FILE_TYPE_COLORS: Record<string, string> = { pdf: '#ef4444', docx: '#3b82f6', pptx: '#f97316', txt: '#10b981', md: '#8b5cf6' }
const FILE_TYPE_LABELS: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', txt: 'TXT', md: 'MD' }
const MODE_LABELS: Record<string, string> = { keyword: '关键词', semantic: '语义', hybrid: '混合' }

const css = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .ss-anim { animation: fadeInUp 0.4s ease-out both; }
  .ss-search:focus-within { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
  .ss-snippet { position: relative; }
  .ss-snippet::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: #6366F1; border-radius: 3px 0 0 3px;
  }
`

function highlightText(text: string, query: string) {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#FDE68A', color: '#0f172a', borderRadius: 4, padding: '0 2px' }}>{p}</mark>
      : p
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [mode, setMode] = useState<'keyword' | 'semantic' | 'hybrid'>('keyword')
  const [courseId, setCourseId] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [courses, setCourses] = useState<CourseItem[]>([])

  const pageSize = 10

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  const doSearch = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return
    setLoading(true)
    try {
      const params: Record<string, string | number> = { q, mode, page: p, page_size: pageSize }
      if (courseId) params.course_id = Number(courseId)
      const r = await api.get<APIResponse<PaginatedResponse<ResultItem>>>('/search', { params })
      if (r.data.code === 0 && r.data.data) {
        setResults(r.data.data.items ?? [])
        setTotal(r.data.data.total)
        setPage(r.data.data.page)
        setTotalPages(r.data.data.total_pages)
      }
      setSearched(true)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [mode, courseId])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) { setQuery(q); doSearch(q, 1) }
  }, [])

  const handleSearch = (p = 1) => {
    setSearchParams({ q: query.trim(), mode } as any)
    doSearch(query.trim(), p)
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

        <div className="ss-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>课程资料搜索</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>输入关键词，快速定位课程文档中的相关内容</p>
        </div>

        <div className="ss-anim" style={{ animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 24 }}>
          <div className="ss-search" style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, transition: 'all 0.2s', marginBottom: 16 }}>
            <div style={{ paddingLeft: 16, color: '#94a3b8', display: 'flex' }}>
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.5} />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            </div>
            <input type="text" placeholder="搜索课程资料、课件、实验报告..."
              value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '12px 12px', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#0f172a' }} />
            <button onClick={() => handleSearch()}
              style={{ marginRight: 6, padding: '8px 24px', background: '#6366F1', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; e.currentTarget.style.boxShadow = 'none' }}
            >搜索</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>检索模式</span>
              <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', fontSize: 12 }}>
                {(['keyword','semantic','hybrid'] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ padding: '6px 14px', fontWeight: 500, cursor: 'pointer', border: 'none',
                      background: mode === m ? '#6366F1' : '#fff', color: mode === m ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>课程筛选</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                style={{ fontSize: 14, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' }}>
                <option value="">全部课程</option>
                {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          {searched && (
            <p className="ss-anim" style={{ animationDelay: '0.1s', fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              共找到 <span style={{ fontWeight: 600, color: '#334155' }}>{total}</span> 条结果（第 {page}/{totalPages} 页）
            </p>
          )}
          {loading && <p style={{ color: '#94a3b8', fontSize: 14 }}>搜索中...</p>}
          {!loading && searched && results.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>未找到相关结果，试试其他关键词</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((item, idx) => {
              const ext = (item.file_type || 'pdf').toLowerCase().replace('courseware','pdf').replace('lab_guide','docx').replace('assignment','pptx').replace('reference','txt')
              const ftColor = FILE_TYPE_COLORS[ext] || '#94a3b8'
              const ftLabel = FILE_TYPE_LABELS[ext] || ext.toUpperCase()
              const snippets = item.matched_snippets ?? []
              return (
                <div key={item.document_id + '-' + idx} className="ss-anim"
                  style={{ animationDelay: `${0.12 + idx * 0.05}s`, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', transition: 'all 0.2s', padding: 20 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, color: '#fff', background: ftColor, flexShrink: 0 }}>{ftLabel}</span>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                    </div>
                    {item.course_name && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#EEF2FF', color: '#4F46E5', fontWeight: 500, flexShrink: 0 }}>{item.course_name}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /><circle cx={8} cy={8} r={6.5} stroke="currentColor" strokeWidth={1.5} /></svg>
                      匹配 {snippets.length} 段
                    </span>
                  </div>
                  {snippets.slice(0, 3).map((s, si) => (
                    <div key={si} className="ss-snippet" style={{ padding: '10px 12px 10px 14px', background: '#f8fafc', borderRadius: '0 8px 8px 0', fontSize: 14, color: '#475569', lineHeight: 1.6, marginTop: si > 0 ? 8 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <span>{highlightText(s.content.substring(0, 200), query)}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginTop: 2 }}>{Math.round(s.score * 100)}%</span>
                      </div>
                    </div>
                  ))}
                  {query && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => window.open(`/student/qa?question=${encodeURIComponent(query)}`, '_self')}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4F46E5', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
                        <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                        Ask AI about this
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => handleSearch(p)}
                  style={{ width: 32, height: 32, borderRadius: 8, fontSize: 14, fontWeight: 500, border: p === page ? 'none' : '1px solid #e2e8f0', background: p === page ? '#6366F1' : '#fff', color: p === page ? '#fff' : '#64748b', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
