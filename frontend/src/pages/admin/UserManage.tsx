import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface UserItem { id: number; username: string; real_name: string; role: string; is_active: boolean; force_password_change?: boolean; created_at: string }

const ROLE_LABELS: Record<string, string> = { student: '学生', teacher: '教师', admin: '管理员' }
const ROLE_COLORS: Record<string, string> = { student: '#10b981', teacher: '#3b82f6', admin: '#ef4444' }

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .au-anim { animation: fadeInUp 0.4s ease-out both; }
`

export default function UserManage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('')
  const [modal, setModal] = useState<{ type: string; user: UserItem } | null>(null)
  const [acting, setActing] = useState(false)
  const [tempPw, setTempPw] = useState('')
  const pageSize = 10

  const load = async (p: number) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, page_size: pageSize }
      if (roleFilter) params.role = roleFilter
      const r = await api.get<APIResponse<PaginatedResponse<UserItem>>>('/admin/users', { params })
      if (r.data.code === 0 && r.data.data) {
        setUsers(r.data.data.items ?? [])
        setTotal(r.data.data.total)
        setPage(p)
        setTotalPages(r.data.data.total_pages)
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [roleFilter])

  const doAction = async () => {
    if (!modal) return
    setActing(true)
    try {
      if (modal.type === 'toggle') {
        await api.put(`/admin/users/${modal.user.id}/disable`)
      } else if (modal.type === 'reset') {
        const r = await api.post<APIResponse<{ temp_password: string }>>(`/admin/users/${modal.user.id}/reset-password`)
        if (r.data.code === 0 && r.data.data) setTempPw(r.data.data.temp_password)
      } else if (modal.type === 'role') {
        // API endpoint not yet implemented; show message
        setActing(false); setModal(null); return
      }
      if (modal.type !== 'reset') { setModal(null); load(page) }
    } catch { /* */ }
    finally { if (modal.type === 'reset') setActing(false) }
  }

  const closeModal = () => { setModal(null); setTempPw('') }

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="au-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>用户管理</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理系统中的所有用户账号</p>
        </div>

        {/* Filter */}
        <div className="au-anim" style={{ animationDelay: '0.05s', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>角色筛选</span>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
              <option value="">全部角色</option>
              <option value="student">学生</option>
              <option value="teacher">教师</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>共 <span style={{ fontWeight: 600, color: '#475569' }}>{total}</span> 条记录</span>
        </div>

        {/* Table */}
        <div className="au-anim" style={{ animationDelay: '0.08s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 64 }}>ID</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>用户名</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>姓名</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 96 }}>角色</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 80 }}>状态</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 176 }}>注册时间</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无用户数据</td></tr>
                ) : users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} style={{
                      transition: 'background 0.2s', borderTop: '1px solid #f8fafc',
                      ...(u.is_active ? {} : { background: '#f8fafc' }),
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = u.is_active ? '#f8fafc' : '#f1f5f9' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = u.is_active ? 'transparent' : '#f8fafc' }}>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{u.id}</td>
                      <td style={{ padding: '14px 20px', fontWeight: 500, color: u.is_active ? '#1e293b' : '#94a3b8' }}>{u.username}</td>
                      <td style={{ padding: '14px 20px', color: u.is_active ? '#475569' : '#94a3b8' }}>{u.real_name || '—'}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (ROLE_COLORS[u.role] || '#64748b') + '18', color: ROLE_COLORS[u.role] || '#64748b' }}>{ROLE_LABELS[u.role] || u.role}</span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: u.is_active ? '#ECFDF5' : '#FEF2F2', color: u.is_active ? '#059669' : '#DC2626' }}>{u.is_active ? '正常' : '已禁用'}</span>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : ''}</td>
                      <td style={{ padding: '14px 20px' }}>
                        {isSelf || u.role === 'admin' ? (
                          <span style={{ fontSize: 12, color: '#cbd5e1' }}>不可操作</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button onClick={() => setModal({ type: 'role', user: u })}
                              style={{ fontSize: 12, color: '#6366F1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>改角色</button>
                            <button onClick={() => setModal({ type: 'reset', user: u })}
                              style={{ fontSize: 12, color: '#6366F1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>重置密码</button>
                            <button onClick={() => setModal({ type: 'toggle', user: u })}
                              style={{ fontSize: 12, color: u.is_active ? '#ef4444' : '#10b981', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = u.is_active ? '#FEF2F2' : '#ECFDF5' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>{u.is_active ? '禁用' : '启用'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
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

        {/* Modal */}
        {modal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={closeModal}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              {modal.type === 'reset' && tempPw ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>密码已重置</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>用户 <strong>{modal.user.username}</strong> 的新临时密码：</p>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: 16 }}>
                    <code style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '0.05em' }}>{tempPw}</code>
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>请复制保存，此密码仅显示一次</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={closeModal}
                      style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#6366F1' }}>关闭</button>
                  </div>
                </>
              ) : modal.type === 'reset' ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>重置密码</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>确定重置用户 <strong>{modal.user.username}</strong> 的密码吗？系统将生成一个临时密码。</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                    <button onClick={closeModal} disabled={acting}
                      style={{ padding: '8px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
                    <button onClick={doAction} disabled={acting}
                      style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#6366F1' }}>
                      {acting ? '处理中...' : '确认重置'}
                    </button>
                  </div>
                </>
              ) : modal.type === 'toggle' ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{modal.user.is_active ? '禁用用户' : '启用用户'}</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>确定{modal.user.is_active ? '禁用' : '启用'}用户 <strong>{modal.user.username}</strong> 吗？</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                    <button onClick={closeModal} disabled={acting}
                      style={{ padding: '8px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
                    <button onClick={doAction} disabled={acting}
                      style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: modal.user.is_active ? '#ef4444' : '#10b981' }}>
                      {acting ? '处理中...' : modal.user.is_active ? '确认禁用' : '确认启用'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>变更角色</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>将用户 <strong>{modal.user.username}</strong> 的角色从「{ROLE_LABELS[modal.user.role]}」变更为：</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button onClick={closeModal} disabled={acting}
                      style={{ padding: '8px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
                  </div>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>提示：角色变更功能需要后端 API 支持，当前暂未实现</p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
