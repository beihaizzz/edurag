import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import type { APIResponse } from '../../types/api'

interface DashboardData { total_users: number; total_courses: number; total_docs: number; pending_docs: number; total_qa: number; today_qa: number }

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ad-anim { animation: fadeInUp 0.4s ease-out both; }
  .ad-stat-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
  .ad-stat-card:hover { transform: translateY(-4px); }
  @keyframes pulse-icon { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.9; } }
  .ad-pulse { animation: pulse-icon 1.2s ease-in-out infinite; }
`

const iconWrap: React.CSSProperties = { display: 'flex', color: '#fff', opacity: 0.5 }

const statDefs: { key: string; label: string; gradient: string; shadow: string; pulse?: boolean; icon: React.ReactNode | ((pending: number) => React.ReactNode) }[] = [
  { key: 'total_users', label: '用户总数', gradient: 'linear-gradient(135deg, #312E81 0%, #4F46E5 100%)', shadow: 'rgba(49,46,129,0.3)',
    icon: <span style={iconWrap}><svg width={18} height={18} viewBox="0 0 18 18" fill="none"><circle cx={9} cy={6} r={3} stroke="currentColor" strokeWidth={1.5} /><path d="M3 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg></span> },
  { key: 'total_courses', label: '课程总数', gradient: 'linear-gradient(135deg, #065F46 0%, #059669 100%)', shadow: 'rgba(6,95,70,0.3)',
    icon: <span style={iconWrap}><svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M3 3h4v4H3V3zM11 3h4v4h-4V3zM3 11h4v4H3v-4zM11 11h4v4h-4v-4z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg></span> },
  { key: 'total_docs', label: '文档总数', gradient: 'linear-gradient(135deg, #164E63 0%, #0891B2 100%)', shadow: 'rgba(22,78,99,0.3)',
    icon: <span style={iconWrap}><svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M4 2h7l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth={1.5} /><path d="M11 2v3h3" stroke="currentColor" strokeWidth={1.5} /></svg></span> },
  { key: 'total_qa', label: '问答总量', gradient: 'linear-gradient(135deg, #9A3412 0%, #EA580C 100%)', shadow: 'rgba(154,52,18,0.3)',
    icon: <span style={iconWrap}><svg width={18} height={18} viewBox="0 0 18 18" fill="none"><path d="M14 12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H4C2.9 2 2 2.9 2 4v6c0 1.1.9 2 2 2h1v2.5L8.5 12H14z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg></span> },
  { key: 'pending_docs', label: '待审核', gradient: 'linear-gradient(135deg, #991B1B 0%, #DC2626 100%)', shadow: 'rgba(153,27,27,0.3)', pulse: true,
    icon: (pending: number) => (
      <span className={pending > 0 ? 'ad-pulse' : ''} style={{ display: 'flex', color: '#fff', opacity: pending > 0 ? undefined : 0.5 }}>
        <svg width={18} height={18} viewBox="0 0 18 18" fill="none"><circle cx={9} cy={9} r={6.5} stroke="currentColor" strokeWidth={1.5} /><path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    ) },
  { key: 'today_qa', label: '今日问答', gradient: 'linear-gradient(135deg, #701A75 0%, #A21CAF 100%)', shadow: 'rgba(112,26,117,0.3)',
    icon: <span style={iconWrap}><svg width={18} height={18} viewBox="0 0 18 18" fill="none"><rect x={2} y={10} width={3} height={5} rx={0.5} stroke="currentColor" strokeWidth={1.5} /><rect x={7.5} y={5} width={3} height={10} rx={0.5} stroke="currentColor" strokeWidth={1.5} /><rect x={13} y={2} width={3} height={13} rx={0.5} stroke="currentColor" strokeWidth={1.5} /></svg></span> },
]

export default function AdminHomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    api.get<APIResponse<DashboardData>>('/admin/dashboard')
      .then((r) => { if (r.data.code === 0 && r.data.data) setData(r.data.data) })
      .catch(() => {})
    const unsub = refreshDashboard.subscribe(() => {
      api.get<APIResponse<DashboardData>>('/admin/dashboard')
        .then((r) => { if (r.data.code === 0 && r.data.data) setData(r.data.data) })
        .catch(() => {})
    })
    return unsub
  }, [])

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="ad-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>管理仪表盘</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>全局数据概览与待办事项</p>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
          {statDefs.map((s, i) => (
            <div key={s.key} className="ad-stat-card ad-anim"
              style={{
                animationDelay: `${0.03 + i * 0.03}s`, borderRadius: 12, color: '#fff', padding: 20, cursor: 'pointer',
                background: s.gradient, boxShadow: `0 4px 14px ${s.shadow}`,
              }}
              onClick={() => { if (s.key === 'pending_docs') navigate('/admin/review'); if (s.key === 'total_users') navigate('/admin/users') }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, opacity: 0.7, fontSize: 12, fontWeight: 500 }}>
                {typeof s.icon === 'function' ? s.icon(data?.pending_docs || 0) : s.icon}
                {s.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{data ? data[s.key as keyof DashboardData] : '—'}</div>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          {/* To-Do */}
          <div className="ad-anim" style={{ animationDelay: '0.2s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>待办事项</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div onClick={() => navigate('/admin/review')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', transition: 'background 0.2s', borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, background: '#FEF2F2', color: '#DC2626', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>待处理</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{data?.pending_docs || 0} 份文档待审核</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>新上传的课程资料需要管理员审核确认</p>
                </div>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ color: '#cbd5e1', flexShrink: 0, marginLeft: 16 }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>日志</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>查看操作日志</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>浏览近期管理后台操作记录与变更</p>
                </div>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ color: '#cbd5e1', flexShrink: 0, marginLeft: 16 }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="ad-anim" style={{ animationDelay: '0.24s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ color: '#6366F1' }}><rect x={2} y={2} width={5} height={5} rx={1} stroke="currentColor" strokeWidth={1.5} /><rect x={9} y={2} width={5} height={5} rx={1} stroke="currentColor" strokeWidth={1.5} /><rect x={2} y={9} width={5} height={5} rx={1} stroke="currentColor" strokeWidth={1.5} /><rect x={9} y={9} width={5} height={5} rx={1} stroke="currentColor" strokeWidth={1.5} /></svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>快捷操作</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={() => navigate('/admin/review')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#4F46E5', color: '#fff', fontWeight: 500, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4338CA'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,70,229,0.35)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#4F46E5'; e.currentTarget.style.boxShadow = 'none' }}>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={1.5} /><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                文档审核
              </button>
              <button onClick={() => navigate('/admin/users')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 500, fontSize: 14, borderRadius: 8, background: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.color = '#4F46E5' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155' }}>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={6} cy={5} r={2} stroke="currentColor" strokeWidth={1.5} /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /><circle cx={11} cy={5} r={1.5} stroke="currentColor" strokeWidth={1.5} /><path d="M13 11c0-1.1.9-2 2-2s2 .9 2 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                用户管理
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
