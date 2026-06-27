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

interface ActionStat { action: string; count: number }

const ACTION_LABELS: Record<string, string> = {
  login: '登录', logout: '退出', register: '注册',
  upload_doc: '上传文档', delete_doc: '删除文档', approve_doc: '审核文档',
  toggle_user: '启/禁用用户', batch_toggle_user: '批量启/禁用',
  reset_password: '重置密码', batch_reset_password: '批量重置密码',
  change_role: '变更角色', batch_change_role: '批量变更角色',
  ask_question: '提问',
}

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .al-anim { animation: fadeInUp 0.4s ease-out both; }
`

interface Filters {
  user_id: string
  action: string
  keyword: string
  start_date: string
  end_date: string
}

const EMPTY_FILTERS: Filters = { user_id: '', action: '', keyword: '', start_date: '', end_date: '' }

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [actionStats, setActionStats] = useState<ActionStat[]>([])
  const pageSize = 20

  // 加载可选 action 类型列表
  useEffect(() => {
    api.get<APIResponse<ActionStat[]>>('/admin/audit-logs/actions')
      .then((r) => { if (r.data.code === 0 && r.data.data) setActionStats(r.data.data) })
      .catch(() => {})
  }, [])

  const load = async (p: number, f: Filters = filters) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, page_size: pageSize }
      if (f.user_id.trim()) params.user_id = Number(f.user_id)
      if (f.action) params.action = f.action
      if (f.keyword.trim()) params.keyword = f.keyword.trim()
      if (f.start_date) params.start_date = new Date(f.start_date).toISOString()
      if (f.end_date) params.end_date = new Date(f.end_date).toISOString()

      const r = await api.get<APIResponse<PaginatedResponse<AuditItem>>>('/admin/audit-logs', { params })
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

  const resetFilters = () => { setFilters(EMPTY_FILTERS); load(1, EMPTY_FILTERS) }

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="al-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>操作日志</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理后台操作记录与变更追踪，支持多条件检索</p>
        </div>

        {/* 筛选区 */}
        <div className="al-anim" style={{ animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto auto', gap: 10, alignItems: 'end' }}>
          <FieldInput label="操作者 ID" type="number" value={filters.user_id} onChange={(v) => setFilters({ ...filters, user_id: v })} placeholder="如 1" />

          <Field label="操作类型">
            <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} style={inputStyle}>
              <option value="">全部</option>
              {actionStats.map((a) => (
                <option key={a.action} value={a.action}>
                  {ACTION_LABELS[a.action] || a.action}（{a.count}）
                </option>
              ))}
            </select>
          </Field>

          <FieldInput label="详情关键词" value={filters.keyword} onChange={(v) => setFilters({ ...filters, keyword: v })} placeholder="文档标题等" />

          <FieldInput label="开始时间" type="datetime-local" value={filters.start_date} onChange={(v) => setFilters({ ...filters, start_date: v })} />
          <FieldInput label="结束时间" type="datetime-local" value={filters.end_date} onChange={(v) => setFilters({ ...filters, end_date: v })} />

          <button onClick={() => load(1)} disabled={loading}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#4338CA', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: loading ? 0.7 : 1, height: 36 }}>
            {loading ? '查询中…' : '查询'}
          </button>
          <button onClick={resetFilters}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', height: 36 }}>
            重置
          </button>
        </div>

        <div className="al-anim" style={{ animationDelay: '0.06s', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>共 <span style={{ fontWeight: 600, color: '#475569' }}>{total}</span> 条记录</span>
        </div>

        <div className="al-anim" style={{ animationDelay: '0.08s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 64 }}>ID</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 140 }}>操作类型</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 80 }}>用户ID</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>详情</th>
                  <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 170 }}>时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无匹配的操作记录</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid #f8fafc', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{l.id}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 500,
                        background: '#EEF2FF', color: '#4F46E5' }}>{ACTION_LABELS[l.action] || l.action}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>{l.user_id}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#475569', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={l.detail ? JSON.stringify(l.detail) : ''}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>{label}</span>
      {children}
    </div>
  )
}

function FieldInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <Field label={label}>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </Field>
  )
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#fff', color: '#1e293b', height: 36, outline: 'none', width: '100%',
}
