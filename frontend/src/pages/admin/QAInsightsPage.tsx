import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import type { APIResponse } from '../../types/api'

interface CourseItem { id: number; name: string; semester: string }
interface FrequentItem { question: string; ask_count: number; last_asked_at: string | null; rejected_count?: number }
interface UnansweredItem { question: string; ask_count: number; last_asked_at: string | null }
interface InsightsData {
  course_id: number | null
  days: number
  frequent_questions: FrequentItem[]
  unanswered_questions: UnansweredItem[]
  stats: { total_qa: number; rejected_qa: number; unique_questions: number }
}

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .qi-anim { animation: fadeInUp 0.4s ease-out both; }
  .qi-bar { transition: width 0.5s cubic-bezier(.2,.7,.2,1); }
`

const RANGE_OPTIONS = [
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
  { value: 180, label: '最近半年' },
  { value: 365, label: '最近 1 年' },
]

export default function QAInsightsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [courses, setCourses] = useState<CourseItem[]>([])
  const [courseId, setCourseId] = useState<number | ''>('')
  const [days, setDays] = useState(30)
  const [topK, setTopK] = useState(10)
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  // 加载课程列表（教师只看自己授课的，所以后端列表已经按权限过滤）
  useEffect(() => {
    api.get<APIResponse<{ items: CourseItem[] }>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  const load = () => {
    setLoading(true); setError('')
    const params: Record<string, number> = { days, top_k: topK }
    if (courseId !== '') params.course_id = courseId as number
    api.get<APIResponse<InsightsData>>('/qa/insights', { params })
      .then((r) => {
        if (r.data.code === 0 && r.data.data) setData(r.data.data)
        else setError(r.data.message || '加载失败')
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail
        const msg = typeof detail === 'string' ? detail : err?.message || '加载失败'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [courseId, days, topK])

  const maxAskCount = useMemo(() => {
    if (!data?.frequent_questions?.length) return 1
    return Math.max(...data.frequent_questions.map((f) => f.ask_count), 1)
  }, [data])

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        <div className="qi-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>问答洞察</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            按课程聚合高频问题与未解答清单，为{isAdmin ? '运营与' : ''}教学内容优化提供数据参考
          </p>
        </div>

        {/* 筛选区 */}
        <div className="qi-anim" style={{
          animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          padding: 16, marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        }}>
          <Field label="课程">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value === '' ? '' : Number(e.target.value))}
              style={selectStyle}>
              <option value="">{isAdmin ? '全部课程' : '我授课的全部课程'}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}（{c.semester}）</option>
              ))}
            </select>
          </Field>

          <Field label="时间范围">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={selectStyle}>
              {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Top N">
            <select value={topK} onChange={(e) => setTopK(Number(e.target.value))} style={selectStyle}>
              {[5, 10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>

          <button onClick={load} disabled={loading}
            style={{ marginLeft: 'auto', padding: '8px 20px', fontSize: 13, fontWeight: 600,
              background: '#4338CA', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
              opacity: loading ? 0.7 : 1 }}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>

        {/* 统计概览 */}
        {data && (
          <div className="qi-anim" style={{ animationDelay: '0.08s', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="问答总量" value={data.stats.total_qa} color="#4F46E5" bg="#EEF2FF" />
            <StatCard label="拒答 / 未解答" value={data.stats.rejected_qa} color="#DC2626" bg="#FEF2F2" />
            <StatCard label="问题去重数" value={data.stats.unique_questions} color="#059669" bg="#ECFDF5" />
          </div>
        )}

        {error && (
          <div className="qi-anim" style={{ padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="qi-anim" style={{ animationDelay: '0.12s', display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
          {/* 高频问题 */}
          <Section title="高频问题" subtitle={`Top ${topK} · 按提问次数降序`} accent="#4F46E5">
            {loading ? (
              <Empty text="加载中…" />
            ) : !data?.frequent_questions?.length ? (
              <Empty text="该时间窗口内暂无问答记录" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.frequent_questions.map((q, i) => {
                  const pct = (q.ask_count / maxAskCount) * 100
                  const hasRejected = (q.rejected_count ?? 0) > 0
                  return (
                    <div key={i} style={{
                      padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: i < 3 ? '#fff' : '#64748b',
                            background: i === 0 ? '#DC2626' : i === 1 ? '#F59E0B' : i === 2 ? '#10B981' : '#f1f5f9',
                            width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{i + 1}</span>
                          <span style={{ fontSize: 14, color: '#1e293b', wordBreak: 'break-word' }}>{q.question}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {hasRejected && (
                            <span title={`其中 ${q.rejected_count} 次被拒答`} style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                              background: '#FEF2F2', color: '#DC2626',
                            }}>拒答 {q.rejected_count}</span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#4338CA' }}>{q.ask_count}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                        <div className="qi-bar" style={{ width: `${pct}%`, height: '100%',
                          background: 'linear-gradient(90deg, #6366F1 0%, #4338CA 100%)' }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        最近提问：{q.last_asked_at ? new Date(q.last_asked_at).toLocaleString('zh-CN') : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* 未解答清单 */}
          <Section title="未解答问题" subtitle="拒答 / 无来源命中" accent="#DC2626">
            {loading ? (
              <Empty text="加载中…" />
            ) : !data?.unanswered_questions?.length ? (
              <Empty text="暂无未解答问题，做得很好 🎉" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.unanswered_questions.map((q, i) => (
                  <div key={i} style={{
                    padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: '#1e293b', wordBreak: 'break-word' }}>{q.question}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: '#FEF2F2', color: '#DC2626', flexShrink: 0 }}>{q.ask_count} 次</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      最近提问：{q.last_asked_at ? new Date(q.last_asked_at).toLocaleString('zh-CN') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </main>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
      <span style={{ fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
          <rect x={2} y={10} width={3} height={5} rx={0.5} stroke="currentColor" strokeWidth={1.5} />
          <rect x={7.5} y={5} width={3} height={10} rx={0.5} stroke="currentColor" strokeWidth={1.5} />
          <rect x={13} y={2} width={3} height={13} rx={0.5} stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{value}</span>
      </div>
    </div>
  )
}

function Section({ title, subtitle, accent, children }: { title: string; subtitle: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{subtitle}</span>
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{text}</div>
}

const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#fff', color: '#1e293b', cursor: 'pointer', minWidth: 140,
}
