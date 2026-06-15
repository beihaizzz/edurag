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

type BatchType = 'role' | 'status' | 'reset' | null

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
  const [selectedRole, setSelectedRole] = useState('')

  // 批量操作
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchModal, setBatchModal] = useState<BatchType>(null)
  const [batchRole, setBatchRole] = useState('')
  const [batchActing, setBatchActing] = useState(false)

  const exitBatchMode = () => { setBatchMode(false); setSelectedIds(new Set()) }
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

  // ── 复选框逻辑 ──
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const selectable = users.filter((u) => u.id !== currentUser?.id)
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectable.map((u) => u.id)))
    }
  }

  const allSelected = (() => {
    const selectable = users.filter((u) => u.id !== currentUser?.id)
    return selectable.length > 0 && selectable.every((u) => selectedIds.has(u.id))
  })()

  const clearSelection = () => setSelectedIds(new Set())

  // ── 单用户操作 ──
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
        await api.put(`/admin/users/${modal.user.id}/role`, { role: selectedRole })
      }
      if (modal.type !== 'reset') { setModal(null); load(page) }
    } catch { /* */ }
    finally { if (modal.type === 'reset') setActing(false) }
  }

  const closeModal = () => { setModal(null); setTempPw(''); setSelectedRole('') }

  // ── 批量操作 ──
  const doBatch = async () => {
    setBatchActing(true)
    const ids = Array.from(selectedIds)
    try {
      if (batchModal === 'role') {
        await api.put('/admin/users/batch/role', { user_ids: ids, role: batchRole })
      } else if (batchModal === 'status') {
        // 取第一个用户的状态反义 = 全部取反
        const first = users.find((u) => ids.includes(u.id))
        await api.put('/admin/users/batch/status', { user_ids: ids, is_active: !first?.is_active })
      } else if (batchModal === 'reset') {
        await api.post('/admin/users/batch/reset-password', { user_ids: ids })
      }
      clearSelection()
      setBatchModal(null)
      load(page)
    } catch { /* */ }
    finally { setBatchActing(false) }
  }

  const closeBatchModal = () => { setBatchModal(null); setBatchRole('') }

  const selectedUsers = users.filter((u) => selectedIds.has(u.id))

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="au-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>用户管理</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理系统中的所有用户账号</p>
        </div>

        {/* Filter + Batch Bar */}
        <div className="au-anim" style={{ animationDelay: '0.05s', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>角色筛选</span>
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); clearSelection() }}
                style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
                <option value="">全部角色</option>
                <option value="student">学生</option>
                <option value="teacher">教师</option>
                <option value="admin">管理员</option>
              </select>
              <button onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                style={{
                  fontSize: 12, fontWeight: 500, padding: '4px 14px', borderRadius: 6, cursor: 'pointer',
                  border: batchMode ? '1px solid #6366F1' : '1px solid #e2e8f0',
                  background: batchMode ? '#EEF2FF' : '#fff',
                  color: batchMode ? '#4338CA' : '#64748b',
                }}>批量操作</button>
            </div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>共 <span style={{ fontWeight: 600, color: '#475569' }}>{total}</span> 条记录</span>
          </div>

          {/* 批量操作栏 */}
          {batchMode && selectedIds.size > 0 && (
            <div style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 8, background: '#EEF2FF', border: '1px solid #C7D2FE',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#4338CA' }}>
                已选 <strong>{selectedIds.size}</strong> 个用户
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setBatchModal('role')}
                  style={batchBtnStyle}>批量改角色</button>
                <button onClick={() => setBatchModal('status')}
                  style={batchBtnStyle}>批量启/禁用</button>
                <button onClick={() => setBatchModal('reset')}
                  style={batchBtnStyle}>批量重置密码</button>
                <button onClick={clearSelection}
                  style={{ ...batchBtnStyle, color: '#64748b', border: '1px solid #e2e8f0', background: '#fff' }}>取消选择</button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="au-anim" style={{ animationDelay: '0.08s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {batchMode && (
                    <th style={{ padding: '14px 12px 14px 20px', width: 40 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#6366F1' }} />
                    </th>
                  )}
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 56 }}>ID</th>
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>用户名</th>
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>姓名</th>
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 88 }}>角色</th>
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 72 }}>状态</th>
                  <th style={{ padding: '14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 160 }}>注册时间</th>
                  <th style={{ padding: '14px 20px 14px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={batchMode ? 8 : 7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={batchMode ? 8 : 7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无用户数据</td></tr>
                ) : users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  const checked = selectedIds.has(u.id)
                  return (
                    <tr key={u.id} style={{
                      transition: 'background 0.2s', borderTop: '1px solid #f8fafc',
                      ...(u.is_active ? {} : { background: '#f8fafc' }),
                      ...(checked ? { background: '#EEF2FF' } : {}),
                    }}
                      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = u.is_active ? '#f8fafc' : '#f1f5f9' }}
                      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = u.is_active ? 'transparent' : '#f8fafc' }}>
                      {batchMode && (
                        <td style={{ padding: '14px 12px 14px 20px' }}>
                          {!isSelf && (
                            <input type="checkbox" checked={checked} onChange={() => toggleSelect(u.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#6366F1' }} />
                          )}
                        </td>
                      )}
                      <td style={{ padding: '14px 12px', fontSize: 12, color: '#94a3b8' }}>{u.id}</td>
                      <td style={{ padding: '14px 12px', fontWeight: 500, color: u.is_active ? '#1e293b' : '#94a3b8' }}>{u.username}</td>
                      <td style={{ padding: '14px 12px', color: u.is_active ? '#475569' : '#94a3b8' }}>{u.real_name || '—'}</td>
                      <td style={{ padding: '14px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (ROLE_COLORS[u.role] || '#64748b') + '18', color: ROLE_COLORS[u.role] || '#64748b' }}>{ROLE_LABELS[u.role] || u.role}</span>
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: u.is_active ? '#ECFDF5' : '#FEF2F2', color: u.is_active ? '#059669' : '#DC2626' }}>{u.is_active ? '正常' : '已禁用'}</span>
                      </td>
                      <td style={{ padding: '14px 12px', fontSize: 12, color: '#94a3b8' }}>{u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : ''}</td>
                      <td style={{ padding: '14px 20px 14px 12px' }}>
                        {isSelf || u.role === 'admin' ? (
                          <span style={{ fontSize: 12, color: '#cbd5e1' }}>不可操作</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button onClick={() => setModal({ type: 'role', user: u })}
                              style={actionBtnStyle('#6366F1')}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>改角色</button>
                            <button onClick={() => setModal({ type: 'reset', user: u })}
                              style={actionBtnStyle('#6366F1')}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>重置密码</button>
                            <button onClick={() => setModal({ type: 'toggle', user: u })}
                              style={actionBtnStyle(u.is_active ? '#ef4444' : '#10b981')}
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

        {/* ====== 单用户 Modal ====== */}
        {modal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={closeModal}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              {modal.type === 'reset' && tempPw ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>密码已重置</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>用户 <strong>{modal.user.username}</strong> 的密码已重置为：</p>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: 16 }}>
                    <code style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '0.05em' }}>{tempPw}</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={closeModal}
                      style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#6366F1' }}>关闭</button>
                  </div>
                </>
              ) : modal.type === 'reset' ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>重置密码</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>确定重置用户 <strong>{modal.user.username}</strong> 的密码吗？密码将重置为 <code style={{ fontWeight: 600, color: '#0f172a' }}>123456</code>。</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                    <button onClick={closeModal} disabled={acting}
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doAction} disabled={acting}
                      style={modalBtnStyle('#fff', '#6366F1')}>
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
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doAction} disabled={acting}
                      style={modalBtnStyle('#fff', modal.user.is_active ? '#ef4444' : '#10b981')}>
                      {acting ? '处理中...' : modal.user.is_active ? '确认禁用' : '确认启用'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>变更角色</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 16px' }}>将用户 <strong>{modal.user.username}</strong> 的角色从「{ROLE_LABELS[modal.user.role]}」变更为：</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <button key={role} onClick={() => setSelectedRole(role)} disabled={role === modal.user.role}
                        style={{
                          padding: '12px 16px', fontSize: 14, fontWeight: 500, borderRadius: 8, textAlign: 'left',
                          border: selectedRole === role ? '2px solid #6366F1' : '1px solid #e2e8f0',
                          background: selectedRole === role ? '#EEF2FF' : (role === modal.user.role ? '#f8fafc' : '#fff'),
                          color: role === modal.user.role ? '#94a3b8' : '#1e293b',
                          cursor: role === modal.user.role ? 'default' : 'pointer',
                        }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ROLE_COLORS[role], marginRight: 8 }} />
                        {label}
                        {role === modal.user.role && <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>（当前角色）</span>}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button onClick={closeModal} disabled={acting}
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doAction} disabled={acting || !selectedRole}
                      style={modalBtnStyle('#fff', selectedRole ? '#6366F1' : '#c7d2fe', undefined, selectedRole ? 'pointer' : 'default')}>
                      {acting ? '处理中...' : '确认变更'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ====== 批量操作 Modal ====== */}
        {batchModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={closeBatchModal}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              {batchModal === 'role' ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>批量变更角色</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 4px' }}>将为以下 <strong>{selectedIds.size}</strong> 个用户变更角色：</p>
                  <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569' }}>
                    {selectedUsers.map((u) => (
                      <span key={u.id} style={{ display: 'inline-block', margin: '2px 6px 2px 0', padding: '2px 8px', background: '#e2e8f0', borderRadius: 4 }}>
                        {u.username} <span style={{ color: '#94a3b8' }}>({ROLE_LABELS[u.role]})</span>
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>选择目标角色：</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <button key={role} onClick={() => setBatchRole(role)}
                        style={{
                          padding: '10px 16px', fontSize: 14, fontWeight: 500, borderRadius: 8, textAlign: 'left',
                          border: batchRole === role ? '2px solid #6366F1' : '1px solid #e2e8f0',
                          background: batchRole === role ? '#EEF2FF' : '#fff',
                          color: '#1e293b', cursor: 'pointer',
                        }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ROLE_COLORS[role], marginRight: 8 }} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button onClick={closeBatchModal} disabled={batchActing}
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doBatch} disabled={batchActing || !batchRole}
                      style={modalBtnStyle('#fff', batchRole ? '#6366F1' : '#c7d2fe', undefined, batchRole ? 'pointer' : 'default')}>
                      {batchActing ? '处理中...' : '确认变更'}
                    </button>
                  </div>
                </>
              ) : batchModal === 'status' ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>批量启/禁用</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>
                    将对以下 <strong>{selectedIds.size}</strong> 个用户统一切换启用/禁用状态：
                  </p>
                  <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569' }}>
                    {selectedUsers.map((u) => (
                      <div key={u.id} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
                        <span>{u.username}</span>
                        <span style={{ color: u.is_active ? '#059669' : '#DC2626', fontWeight: 500 }}>
                          {u.is_active ? '正常' : '已禁用'} → {u.is_active ? '禁用' : '启用'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={closeBatchModal} disabled={batchActing}
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doBatch} disabled={batchActing}
                      style={modalBtnStyle('#fff', '#6366F1')}>
                      {batchActing ? '处理中...' : '确认执行'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>批量重置密码</p>
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>
                    确定重置以下 <strong>{selectedIds.size}</strong> 个用户的密码吗？所有密码将统一重置为 <code style={{ fontWeight: 600, color: '#0f172a' }}>123456</code>。
                  </p>
                  <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569' }}>
                    {selectedUsers.map((u) => (
                      <span key={u.id} style={{ display: 'inline-block', margin: '2px 6px 2px 0', padding: '2px 8px', background: '#e2e8f0', borderRadius: 4 }}>{u.username}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button onClick={closeBatchModal} disabled={batchActing}
                      style={modalBtnStyle('#64748b', '#fff', '#e2e8f0')}>取消</button>
                    <button onClick={doBatch} disabled={batchActing}
                      style={modalBtnStyle('#fff', '#ef4444')}>
                      {batchActing ? '处理中...' : '确认重置'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

// ── 样式工厂 ──
const actionBtnStyle = (color: string): React.CSSProperties => ({
  fontSize: 12, color, fontWeight: 500, background: 'none',
  border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
})

const batchBtnStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 6,
  border: '1px solid #C7D2FE', cursor: 'pointer', color: '#4338CA', background: '#fff',
}

const modalBtnStyle = (color: string, bg: string, border?: string, cursor?: string): React.CSSProperties => ({
  padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8,
  border: border ? `1px solid ${border}` : 'none',
  cursor: cursor ?? 'pointer', color, background: bg,
})
