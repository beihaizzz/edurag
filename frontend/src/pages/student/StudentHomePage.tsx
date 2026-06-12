import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface CourseItem { id: number; name: string }

const COURSE_COLORS = [
  '#0891b2','#dc2626','#059669','#7c3aed','#d97706',
  '#0d9488','#0284c7','#db2777','#4f46e5',
]

const POPULAR_QUESTIONS = [
  '操作系统实验报告怎么写？有哪些注意事项？',
  '高等数学期末重点是什么？怎么高效复习？',
  '数据结构中的二叉树遍历有哪些实际应用场景？',
  '大学物理电磁学部分有哪些常见考点和解题技巧？',
  '深度学习入门应该从哪些经典项目开始实践？',
]

const RECENT_SEARCHES = [
  '操作系统进程调度算法',
  '高等数学极限与连续',
  '数据结构二叉树遍历',
  '深度学习CNN模型',
]

const platformFeatures = [
  { color: '#06b6d4', text: '多课程资料统一检索' },
  { color: '#10b981', text: '自然语言智能问答' },
  { color: '#f59e0b', text: '课程分类精准筛选' },
  { color: '#8b5cf6', text: '历史问答记录回溯' },
  { color: '#f43f5e', text: '教师上传资料管理' },
]

const css = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .sh-anim-up { animation: fadeInUp 0.5s ease-out both; }
  .sh-tag { transition: all 0.2s ease; }
  .sh-tag:hover { transform: scale(1.04); box-shadow: 0 2px 12px rgba(99,102,241,0.2); }
  .sh-search:focus-within { box-shadow: 0 0 0 3px rgba(99,102,241,0.2); }
`

export default function StudentHomePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const [searchQ, setSearchQ] = useState('')
  const handleSearch = () => {
    const q = searchQ.trim()
    if (q) navigate(`/student/search?q=${encodeURIComponent(q)}`)
  }

  const courseList = courses.length > 0 ? courses : [
    { id: 1, name: '大学物理' },{ id: 2, name: '高等数学' },{ id: 3, name: '程序设计' },
    { id: 4, name: '操作系统' },{ id: 5, name: '数据结构' },{ id: 6, name: '深度学习' },
    { id: 7, name: '软件工程' },{ id: 8, name: '数字图像处理' },{ id: 9, name: 'Unity开发' },
  ]

  const courseCount = courses.length || 9

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>

        {/* Hero */}
        <div className="sh-anim-up" style={{
          position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: 32,
          background: 'linear-gradient(135deg, #312E81 0%, #4338CA 40%, #4F46E5 70%, #6366F1 100%)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          <div style={{
            position: 'absolute', top: -80, right: -80,
            width: 320, height: 320, borderRadius: '50%',
            background: 'rgba(129,140,248,0.1)', filter: 'blur(48px)',
          }} />
          <div style={{
            position: 'absolute', bottom: -80, left: -80,
            width: 256, height: 256, borderRadius: '50%',
            background: 'rgba(165,180,252,0.1)', filter: 'blur(48px)',
          }} />

          <div style={{ position: 'relative', zIndex: 10, padding: '56px 32px', textAlign: 'center' }}>
            <h1 style={{
              fontSize: 30, fontWeight: 800, color: '#fff', marginBottom: 12,
              letterSpacing: '-0.02em',
            }}>
              课程资料检索与智能问答
            </h1>
            <p style={{
              color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 40,
              maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6,
            }}>
              基于 RAG 技术的校园课程知识库，精准检索 + 智能问答，让学习更高效
            </p>

            {/* Search Box */}
            <div style={{ maxWidth: 540, margin: '0 auto' }}>
              <div className="sh-search" style={{
                display: 'flex', alignItems: 'center', background: '#fff',
                borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                transition: 'all 0.2s',
              }}>
                <div style={{ paddingLeft: 20, color: '#94a3b8', display: 'flex' }}>
                  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                    <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.5} />
                    <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="输入关键词或问题，开始检索..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    flex: 1, padding: '16px 16px', background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 14, color: '#0f172a',
                  }}
                />
                <button
                  onClick={handleSearch}
                  style={{
                    marginRight: 8, padding: '10px 24px', background: '#6366F1', color: '#fff',
                    fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  搜索
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Course Categories */}
              <div className="sh-anim-up" style={{ animationDelay: '0.15s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                      <path d="M4 4h4v4H4V4zM13 4h4v4h-4V4zM4 13h4v4H4v-4zM13 13h4v4h-4v-4z" stroke="#6366F1" strokeWidth={1.5} strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>课程分类</h2>
                  <span style={{ fontSize: 12, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>{courseCount} 门课程</span>
                </div>
                <div style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {loading ? (
                    <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中...</span>
                  ) : courseList.map((c, i) => {
                    const color = COURSE_COLORS[i % COURSE_COLORS.length]
                    return (
                      <span
                        key={c.id}
                        className="sh-tag"
                        onClick={() => navigate(`/student/search?course=${encodeURIComponent(c.name)}`)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', padding: '8px 16px',
                          fontSize: 14, fontWeight: 500, borderRadius: 99, cursor: 'pointer',
                          color, background: `${color}14`, border: `1px solid ${color}28`,
                        }}
                      >
                        {c.name}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Popular Questions */}
              <div className="sh-anim-up" style={{ animationDelay: '0.2s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                      <path d="M10 2c.6 0 1 .4 1 1v1.1c2.6.5 4.7 2.6 5.2 5.2.2.8 1 1.3 1.8 1.1.6-.2 1 .4 1 1 0 .6-.3 1.1-.9 1.2-1.1.3-1.9 1.2-2.2 2.3-.3 1-.1 2.1.5 2.9.3.5.1 1.1-.3 1.4-.5.3-1.1.2-1.5-.3-.7-.8-1.8-1-2.9-.7C11.7 19.3 11 19 11 18.3V17H9v1.3c0 .7-.7 1-1.3.9-1-.3-2.2-.1-2.9.7-.4.5-1 .6-1.5.3-.4-.3-.6-.9-.3-1.4.6-.8.8-1.9.5-2.9-.3-1.1-1.1-2-2.2-2.3C.3 13.3 0 12.8 0 12.2c0-.6.4-1.2 1-1 .8.2 1.6-.3 1.8-1.1.5-2.6 2.6-4.7 5.2-5.2V4c0-.6.4-1 1-1z" stroke="#f59e0b" strokeWidth={1.5} strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>热门问题</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {POPULAR_QUESTIONS.map((q, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(`/student/search?q=${encodeURIComponent(q)}`)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 24px', cursor: 'pointer',
                        borderBottom: i < POPULAR_QUESTIONS.length - 1 ? '1px solid #f8fafc' : 'none',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(238,242,255,0.5)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 14, color: '#334155' }}>{q}</span>
                      <svg width={16} height={16} viewBox="0 0 20 20" fill="none" style={{ color: '#cbd5e1', flexShrink: 0, marginLeft: 12 }}>
                        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="sh-anim-up" style={{ animationDelay: '0.25s', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Platform Features */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>平台功能</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {platformFeatures.map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#475569' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Data Overview */}
              <div style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #EEF2FF 50%)', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>数据概览</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>已收录课程</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#4F46E5' }}>{courseCount}</span>
                  </div>
                  <div style={{ height: 1, background: '#e2e8f0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>文档总数</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#4F46E5' }}>—</span>
                  </div>
                  <div style={{ height: 1, background: '#e2e8f0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#64748b' }}>今日问答</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#4F46E5' }}>—</span>
                  </div>
                </div>
              </div>

              {/* Recent Searches */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>最近搜索</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {RECENT_SEARCHES.map((s, i) => (
                    <a
                      key={i}
                      onClick={() => navigate(`/student/search?q=${encodeURIComponent(s)}`)}
                      style={{
                        fontSize: 14, color: '#64748b', cursor: 'pointer', textDecoration: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#4F46E5' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b' }}
                    >
                      {s}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
