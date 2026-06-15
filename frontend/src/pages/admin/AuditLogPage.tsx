import { useState, useEffect } from 'react'
import api from '../../services/api'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface AuditItem {
  id: number
  user_id: number
  action: string
  detail: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  login: '登录', logout: '退出', register: '注册',
  upload: '上传文档', delete_doc: '删除文档', approve_doc: '审核文档',
  disable_user: '启/禁用用户', reset_password: '重置密码', change_role: '变更角色',
  ask_question: '提问',
}
const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .al-anim { animation: fadeInUp 0.4s ease-out both; }
`

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 20

  const load = async (p: number) => {
    setLoading(true)
    try {
      const r = await api.get<APIResponse<PaginatedResponse<AuditItem>>>('/admin/audit-logs', {
        params: { page: p, page_size: pageSize }
      })
      if (r.data.code === 0 && r.data.data) {
        setLogs(r.data.data.items ?? [])
        setTotal(r.data.data.total)
        setPage(p)
        setTotalPages(r.data.data.total_pages)
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [])

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="al-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>操作日志</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理后台操作记录与变更追踪</p>
        </div>

        <div className="al-anim" style={{ animationDelay: '0.05s', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>共 <span style={{ fontWeight: 600, color: '#475569' }}>{total}</span> 条记录</span>
        </div>

        <div className="al-anim" style={{ animationDelay: '0.08s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 64 }}>ID</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 120 }}>操作类型</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 70 }}>用户ID</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>详情</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 170 }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无操作记录</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} style={{
                    borderTop: '1px solid #f8fafc', transition: 'background 0.2s',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{l.id}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 500,
                        background: '#EEF2FF', color: '#4F46E5' }}>{ACTION_LABELS[l.action] || l.action}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>{l.user_id}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#475569', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.detail ? JSON.stringify(l.detail) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>{l.created_at ? new Date(l.created_at).toLocaleString('zh-CN') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: 6 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => load(p)}
                  style={{ width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 500, border: p === page ? 'none' : '1px solid #e2e8f0', background: p === page ? '#4338CA' : '#fff', color: p === page ? '#fff' : '#64748b', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
