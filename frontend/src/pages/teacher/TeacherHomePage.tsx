import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import type { APIResponse } from '../../types/api'

interface DocStats { total: number; pending: number; approved: number; rejected: number }
interface DocItem { id: number; title: string; file_type: string; status: string; created_at: string }

const TYPE_LABELS: Record<string, string> = { courseware: '课件', lab_guide: '实验指导', assignment: '作业', reference: '参考资料', other: '其他' }
const TYPE_COLORS: Record<string, string> = { courseware: '#3b82f6', lab_guide: '#06b6d4', assignment: '#f97316', reference: '#8b5cf6', other: '#64748b' }
const STATUS_LABELS: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
const STATUS_COLORS: Record<string, string> = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .th-anim { animation: fadeInUp 0.4s ease-out both; }
`

export default function TeacherHomePage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DocStats>({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [recentDocs, setRecentDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<APIResponse<DocStats>>('/documents/statistics'),
      api.get<APIResponse<{ items: DocItem[] }>>('/documents', { params: { page: 1, page_size: 5 } }),
    ]).then(([sr, dr]) => {
      if (sr.data.code === 0 && sr.data.data) setStats(sr.data.data)
      if (dr.data.code === 0 && dr.data.data) setRecentDocs(dr.data.data.items ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const statCards = [
    { label: '已上传文档', value: stats.total, unit: '份资料', color: '#6366F1', bg: '#EEF2FF', icon: 'doc' },
    { label: '待审核', value: stats.pending, unit: '需处理', color: '#F59E0B', bg: '#FFFBEB', icon: 'clock' },
    { label: '审核通过', value: stats.approved, unit: '已就绪', color: '#10B981', bg: '#ECFDF5', icon: 'check' },
  ]

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>

        <div className="th-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>教师工作台</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理课程资料，追踪文档处理状态</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {statCards.map((card, i) => (
            <div key={i} className="th-anim" style={{
              animationDelay: `${0.05 + i * 0.05}s`, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
              borderLeft: `4px solid ${card.color}`, padding: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>{card.label}</span>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {card.icon === 'doc' && <svg width={20} height={20} viewBox="0 0 20 20" fill="none"><path d="M5 3h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" stroke={card.color} strokeWidth={1.5} /><path d="M7 9h6M7 13h3" stroke={card.color} strokeWidth={1.5} strokeLinecap="round" /></svg>}
                  {card.icon === 'clock' && <svg width={20} height={20} viewBox="0 0 20 20" fill="none"><circle cx={10} cy={10} r={7} stroke={card.color} strokeWidth={1.5} /><path d="M10 6v4l2.5 2.5" stroke={card.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  {card.icon === 'check' && <svg width={20} height={20} viewBox="0 0 20 20" fill="none"><circle cx={10} cy={10} r={7} stroke={card.color} strokeWidth={1.5} /><path d="M7 10l2 2 4-4" stroke={card.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              </div>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{loading ? '—' : card.value}</span>
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{card.unit}</span>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="th-anim" style={{ animationDelay: '0.18s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>快捷操作</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => navigate('/teacher/documents/upload')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#4338CA', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#3730A3'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(67,56,202,0.35)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#4338CA'; e.currentTarget.style.boxShadow = 'none' }}>
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
                上传文档
              </button>
              <button onClick={() => navigate('/teacher/documents')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', border: '1px solid #C7D2FE', color: '#4338CA', fontWeight: 600, fontSize: 14, borderRadius: 8, background: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none"><path d="M5 3h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="currentColor" strokeWidth={1.5} /><path d="M7 9h6M7 13h3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                文档管理
              </button>
            </div>
          </div>
        </div>

        {/* Recent Uploads */}
        <div className="th-anim" style={{ animationDelay: '0.22s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>最近上传</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>文件名</th>
                  <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 112 }}>类型</th>
                  <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 112 }}>状态</th>
                  <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 176 }}>上传时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : recentDocs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>暂无上传记录</td></tr>
                ) : recentDocs.map((doc) => (
                  <tr key={doc.id}
                    onClick={() => navigate(`/teacher/documents`)}
                    style={{ cursor: 'pointer', transition: 'background 0.2s', borderTop: '1px solid #f8fafc' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ color: '#6366F1' }}><path d="M4 2h8v12H4V2z" stroke="currentColor" strokeWidth={1.5} /><path d="M6 6h4M6 9h3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                        <span style={{ fontWeight: 500, color: '#1e293b', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (TYPE_COLORS[doc.file_type] || '#64748b') + '18', color: TYPE_COLORS[doc.file_type] || '#64748b' }}>{TYPE_LABELS[doc.file_type] || doc.file_type}</span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (STATUS_COLORS[doc.status] || '#94a3b8') + '18', color: STATUS_COLORS[doc.status] || '#64748b' }}>{STATUS_LABELS[doc.status] || doc.status}</span>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: '#94a3b8' }}>{doc.created_at ? new Date(doc.created_at).toLocaleString('zh-CN') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <button onClick={() => navigate('/teacher/documents')}
              style={{ fontSize: 12, color: '#4F46E5', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
              查看全部文档 →
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
