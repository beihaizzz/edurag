import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface CourseItem { id: number; name: string }

const COURSE_COLORS = ['#2f80b7', '#0d9488', '#3b82a8', '#4f9fc6', '#256d85', '#468faf']

const platformFeatures = [
  { color: '#2f80b7', text: '多课程资料统一检索' },
  { color: '#0d9488', text: '自然语言智能问答' },
  { color: '#d97706', text: '课程分类精准筛选' },
  { color: '#468faf', text: '历史问答记录回溯' },
  { color: '#3b82a8', text: '教师上传资料管理' },
]

const fallbackCourses = [
  { id: 1, name: '大学物理' },
  { id: 2, name: '高等数学' },
  { id: 3, name: '程序设计' },
  { id: 4, name: '操作系统' },
  { id: 5, name: '数据结构' },
  { id: 6, name: '深度学习' },
  { id: 7, name: '软件工程' },
  { id: 8, name: '数字图像处理' },
  { id: 9, name: 'Unity 开发' },
]

const css = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .sh-anim-up { animation: fadeInUp 0.5s ease-out both; }
  .sh-tag { transition: all 0.2s ease; }
  .sh-tag:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(47,128,183,0.14); }
  .sh-search:focus-within { box-shadow: 0 0 0 3px rgba(111,182,220,0.24), 0 18px 42px rgba(4,11,20,.18); }
`

export default function StudentHomePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [docCount, setDocCount] = useState<number | null>(null)
  const [todayQa, setTodayQa] = useState<number | null>(null)
  const [searchQ, setSearchQ] = useState('')

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.get<APIResponse<{ total: number }>>('/documents/statistics')
      .then((r) => { if (r.data.code === 0 && r.data.data) setDocCount(r.data.data.total) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.get<APIResponse<{ today_qa: number }>>('/qa/statistics')
      .then((r) => { if (r.data.code === 0 && r.data.data) setTodayQa(r.data.data.today_qa) })
      .catch(() => {})
  }, [])

  const handleSearch = () => {
    const q = searchQ.trim()
    if (q) navigate(`/student/search?q=${encodeURIComponent(q)}`)
  }

  const courseList = courses.length > 0 ? courses : fallbackCourses
  const courseCount = courses.length || fallbackCourses.length

  return (
    <>
      <style>{css}</style>
      <main className="seal-page-shell" style={{ minHeight: 'calc(100vh - 64px)', padding: '20px 24px 32px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto' }}>
          <section className="sh-anim-up" style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 14,
            marginBottom: 20,
            background: 'radial-gradient(circle at 80% 20%, rgba(111,182,220,.36), transparent 18rem), linear-gradient(135deg, #071827 0%, #0f2847 54%, #2f80b7 100%)',
            boxShadow: '0 22px 60px rgba(7,24,39,.22)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.11,
              backgroundImage: 'radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }} />
            <img src="/seal-logo-transparent.png" alt="" style={{
              position: 'absolute',
              right: 36,
              bottom: -22,
              width: 188,
              height: 188,
              objectFit: 'contain',
              opacity: 0.22,
              filter: 'drop-shadow(0 18px 34px rgba(0,0,0,.25))',
            }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '38px 32px', textAlign: 'center' }}>
              <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>
                课程资料检索与智能问答
              </h1>
              <p style={{ color: 'rgba(232,245,251,0.72)', fontSize: 15, margin: '0 auto 28px', maxWidth: 560, lineHeight: 1.7 }}>
                基于 RAG 技术的校园课程知识库，精准检索、智能问答，让学习资料更容易被找到。
              </p>

              <div style={{ maxWidth: 560, margin: '0 auto' }}>
                <div className="sh-search" style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,.96)',
                  borderRadius: 12,
                  border: '1px solid rgba(207,231,244,.8)',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ paddingLeft: 20, color: 'var(--seal-primary)', display: 'flex' }}>
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
                    style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--seal-ink)' }}
                  />
                  <button onClick={handleSearch} style={primaryBtnStyle}>搜索</button>
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 20 }}>
            <section className="sh-anim-up seal-card" style={{ animationDelay: '0.12s', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--seal-border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--seal-ice)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
                    <path d="M4 4h4v4H4V4zM13 4h4v4h-4V4zM4 13h4v4H4v-4zM13 13h4v4h-4v-4z" stroke="var(--seal-primary)" strokeWidth={1.5} strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--seal-ink)', margin: 0 }}>课程分类</h2>
                <span style={{ fontSize: 11, color: 'var(--seal-muted)', background: 'var(--seal-ice)', padding: '2px 8px', borderRadius: 99 }}>{courseCount} 门课程</span>
              </div>
              <div style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {loading ? (
                  <span style={{ color: 'var(--seal-muted)', fontSize: 14 }}>加载中...</span>
                ) : courseList.map((c, i) => {
                  const color = COURSE_COLORS[i % COURSE_COLORS.length]
                  return (
                    <span
                      key={c.id}
                      className="sh-tag"
                      onClick={() => navigate(`/student/search?course=${encodeURIComponent(c.name)}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', fontSize: 14, fontWeight: 600, borderRadius: 99, cursor: 'pointer', color, background: `${color}14`, border: `1px solid ${color}30` }}
                    >
                      {c.name}
                    </span>
                  )
                })}
              </div>
            </section>

            <section className="sh-anim-up seal-card" style={{ animationDelay: '0.2s', borderRadius: 12, padding: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--seal-ink)', margin: '0 0 14px' }}>平台功能</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {platformFeatures.map((f) => (
                  <li key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#31546b' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                    {f.text}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="sh-anim-up seal-card" style={{
            animationDelay: '0.28s',
            marginTop: 20,
            borderRadius: 12,
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            gap: 18,
          }}>
            {[
              { label: '已收录课程', value: courseCount },
              { label: '文档总数', value: docCount ?? '-' },
              { label: '今日问答', value: todayQa ?? '-' },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--seal-muted)' }}>{item.label}</span>
                  <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: 'var(--seal-primary)' }}>{item.value}</p>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, height: 38, background: 'var(--seal-border)' }} />}
              </div>
            ))}
          </section>
        </div>
      </main>
    </>
  )
}

const primaryBtnStyle: React.CSSProperties = {
  marginRight: 8,
  padding: '10px 24px',
  background: 'var(--seal-primary)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
}
