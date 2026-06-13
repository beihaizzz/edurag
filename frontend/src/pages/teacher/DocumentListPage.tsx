import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import { useAuthStore } from '../../stores/authStore'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface CourseItem { id: number; name: string }
interface DocItem { id: number; title: string; file_type: string; filename: string; file_size: number; status: string; processing_status: string; course: { id: number; name: string } | null; created_at: string }
interface DocDetail extends DocItem { description: string; tags: string[]; uploader: { id: number; real_name: string } | null; chunks_preview: { chunk_index: number; content: string; char_count: number }[] }

const TYPE_LABELS: Record<string, string> = { courseware: '课件', lab_guide: '实验指导', assignment: '作业', reference: '参考资料', other: '其他' }
const TYPE_COLORS: Record<string, string> = { courseware: '#3b82f6', lab_guide: '#06b6d4', assignment: '#f97316', reference: '#8b5cf6', other: '#64748b' }
const STATUS_LABELS: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
const STATUS_COLORS: Record<string, string> = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }
const PROC_LABELS: Record<string, string> = { pending: '待处理', processing: '处理中', completed: '已完成', failed: '失败' }
const PROC_COLORS: Record<string, string> = { pending: '#94a3b8', processing: '#3b82f6', completed: '#10b981', failed: '#ef4444' }

function fmtSize(bytes: number) { return (bytes / 1024 / 1024).toFixed(1) + ' MB' }

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .td-anim { animation: fadeInUp 0.4s ease-out both; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .td-spin { animation: spin 0.8s linear infinite; }
  .td-modal-overlay { animation: fadeInUp 0.15s ease-out; }
`

export default function DocumentListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [docs, setDocs] = useState<DocItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [courseFilter, setCourseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [modal, setModal] = useState<{ type: string; doc: DocItem } | null>(null)
  const [acting, setActing] = useState(false)
  const [viewDoc, setViewDoc] = useState<DocDetail | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const PAGE_SIZE = 10

  useEffect(() => {
    api.get<APIResponse<PaginatedResponse<CourseItem>>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  const load = async (p: number) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, page_size: PAGE_SIZE }
      if (courseFilter) params.course_id = Number(courseFilter)
      if (typeFilter) params.file_type = typeFilter
      if (statusFilter) params.status = statusFilter
      const r = await api.get<APIResponse<PaginatedResponse<DocItem>>>('/documents', { params })
      if (r.data.code === 0 && r.data.data) {
        setDocs(r.data.data.items ?? [])
        setTotal(r.data.data.total)
        setPage(p)
        setTotalPages(r.data.data.total_pages)
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [courseFilter, typeFilter, statusFilter])

  const openView = async (id: number) => {
    setViewLoading(true); setViewDoc(null)
    try {
      const r = await api.get<APIResponse<DocDetail>>(`/documents/${id}`)
      if (r.data.code === 0 && r.data.data) setViewDoc(r.data.data)
    } catch { /* */ }
    finally { setViewLoading(false) }
  }

  const doAction = async (id: number, action: string, extra?: Record<string, string>) => {
    setActing(true)
    try {
      if (action === 'delete') {
        await api.delete(`/documents/${id}`)
      } else if (action === 'approve') {
        await api.post(`/documents/${id}/approve`, { status: extra?.status || 'approved', comment: extra?.comment || '' })
      } else if (action === 'process') {
        await api.post(`/documents/${id}/process`)
      }
      refreshDashboard.trigger()
      load(page)
    } catch { /* */ }
    finally { setModal(null); setActing(false) }
  }

  const openModal = (type: string, doc: DocItem) => setModal({ type, doc })

  const courseList = courses.length > 0 ? courses : [
    { id: 1, name: '大学物理' },{ id: 2, name: '高等数学' },{ id: 3, name: '程序设计' },
    { id: 4, name: '操作系统' },{ id: 5, name: '数据结构' },{ id: 6, name: '深度学习' },
    { id: 7, name: '软件工程' },{ id: 8, name: '数字图像处理' },{ id: 9, name: 'Unity开发' },
  ]

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div className="td-anim" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>文档管理</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>管理你上传的所有课程资料</p>
          </div>
          <button onClick={() => navigate('/teacher/documents/upload')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#4338CA', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3730A3'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(67,56,202,0.35)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#4338CA'; e.currentTarget.style.boxShadow = 'none' }}>
            <svg width={16} height={16} viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
            上传资料
          </button>
        </div>

        {/* Filters */}
        <div className="td-anim" style={{ animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>课程</span>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}
                style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
                <option value="">全部课程</option>
                {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>类型</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
                <option value="">全部类型</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>状态</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', background: '#fff', color: '#475569', outline: 'none', cursor: 'pointer' }}>
                <option value="">全部状态</option>
                <option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已驳回</option>
              </select>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>共 <span style={{ fontWeight: 600, color: '#475569' }}>{total}</span> 条记录</span>
          </div>
        </div>

        {/* Table */}
        <div className="td-anim" style={{ animationDelay: '0.1s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>标题</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 96 }}>类型</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 112 }}>课程</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 80 }}>大小</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 96 }}>状态</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 176 }}>上传时间</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 160 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : docs.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无文档记录</td></tr>
                ) : docs.map((doc) => (
                  <tr key={doc.id} style={{ transition: 'background 0.2s', borderTop: '1px solid #f8fafc' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ color: '#6366F1' }}><path d="M4 2h8v12H4V2z" stroke="currentColor" strokeWidth={1.5} /><path d="M6 6h4M6 9h3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                        <span style={{ fontWeight: 500, color: '#1e293b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (TYPE_COLORS[doc.file_type] || '#64748b') + '18', color: TYPE_COLORS[doc.file_type] || '#64748b' }}>{TYPE_LABELS[doc.file_type] || doc.file_type}</span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#64748b' }}>{doc.course?.name || '—'}</td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{fmtSize(doc.file_size)}</td>
                    <td style={{ padding: '14px 20px' }}>
                      {/* Combined: processing_status + approval status */}
                      {doc.processing_status === 'processing' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: '#EFF6FF', color: '#2563EB' }}>
                          <span className="td-spin" style={{ width: 10, height: 10, border: '2px solid #BFDBFE', borderTopColor: '#3B82F6', borderRadius: '50%', display: 'inline-block' }} />
                          处理中
                        </span>
                      ) : doc.processing_status === 'failed' ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: '#FEF2F2', color: '#DC2626' }}>失败</span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (STATUS_COLORS[doc.status] || '#94a3b8') + '18', color: STATUS_COLORS[doc.status] || '#64748b' }}>{STATUS_LABELS[doc.status] || doc.status}</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>{doc.created_at ? new Date(doc.created_at).toLocaleString('zh-CN') : ''}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => openView(doc.id)}
                          style={{ fontSize: 12, color: '#4F46E5', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>详情</button>

                        {doc.processing_status !== 'processing' && (
                          <button onClick={() => openModal('delete', doc)}
                            style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>删除</button>
                        )}

                        {isAdmin && doc.status === 'pending' && doc.processing_status !== 'processing' && (
                          <>
                            <button onClick={() => openModal('approve', doc)}
                              style={{ fontSize: 12, color: '#10b981', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#ECFDF5' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>通过</button>
                            <button onClick={() => openModal('reject', doc)}
                              style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>驳回</button>
                          </>
                        )}

                        {doc.processing_status === 'failed' && (
                          <button onClick={() => doAction(doc.id, 'process')}
                            style={{ fontSize: 12, color: '#D97706', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFBEB' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>重新处理</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>共 {total} 条</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => load(p)}
                  style={{ width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 500, border: p === page ? 'none' : '1px solid #e2e8f0', background: p === page ? '#4338CA' : '#fff', color: p === page ? '#fff' : '#64748b', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* View Modal */}
        {(viewDoc || viewLoading) && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 101, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={() => { setViewDoc(null); setViewLoading(false) }}>
            <div style={{ background: '#fff', borderRadius: 12, maxWidth: 680, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              {viewLoading ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</div>
              ) : viewDoc ? (
                <>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{viewDoc.title}</h3>
                    <button onClick={() => { setViewDoc(null); setViewLoading(false) }}
                      style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 20, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>文件名</span><p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.filename}</p></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>类型</span><p style={{ margin: '4px 0 0 0' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (TYPE_COLORS[viewDoc.file_type] || '#64748b') + '18', color: TYPE_COLORS[viewDoc.file_type] || '#64748b' }}>{TYPE_LABELS[viewDoc.file_type] || viewDoc.file_type}</span></p></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>课程</span><p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.course?.name || '—'}</p></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>上传者</span><p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.uploader?.real_name || '—'}</p></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>文件大小</span><p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{(viewDoc.file_size / 1024 / 1024).toFixed(1)} MB</p></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8' }}>状态</span><p style={{ margin: '4px 0 0 0' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (STATUS_COLORS[viewDoc.status] || '#94a3b8') + '18', color: STATUS_COLORS[viewDoc.status] || '#64748b' }}>{STATUS_LABELS[viewDoc.status] || viewDoc.status}</span></p></div>
                    </div>
                    {viewDoc.description && <div style={{ marginBottom: 20 }}><span style={{ fontSize: 12, color: '#94a3b8' }}>描述</span><p style={{ fontSize: 14, color: '#475569', margin: '4px 0 0 0', lineHeight: 1.6 }}>{viewDoc.description}</p></div>}
                    {viewDoc.tags && viewDoc.tags.length > 0 && <div style={{ marginBottom: 20 }}><span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>标签</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{viewDoc.tags.map((t, i) => <span key={i} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: '#EEF2FF', color: '#4F46E5', fontWeight: 500 }}>{t}</span>)}</div></div>}
                    {viewDoc.chunks_preview && viewDoc.chunks_preview.length > 0 && (
                      <div><span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 8 }}>内容预览</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{viewDoc.chunks_preview.map((c, ci) => <div key={ci} style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #6366F1', fontSize: 13, color: '#475569', lineHeight: 1.6 }}><span style={{ fontSize: 10, color: '#94a3b8', marginRight: 8 }}>#{c.chunk_index}</span>{c.content}</div>)}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={async () => { try { const r = await api.get(`/documents/${viewDoc.id}/file`, { responseType: 'blob' }); window.open(URL.createObjectURL(r.data), '_blank') } catch { /* */ } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#6366F1', borderRadius: 8, border: '1px solid #C7D2FE', background: '#fff', cursor: 'pointer' }}>
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M2 3h12v10H2V3z" stroke="currentColor" strokeWidth={1.5} /><path d="M6 6h4M6 9h2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                      预览文件
                    </button>
                    <button onClick={() => { setViewDoc(null); setViewLoading(false) }} style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, color: '#64748b', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>关闭</button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {modal && (
          <div className="td-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setModal(null)}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>
                {modal.type === 'delete' ? '确认删除' : modal.type === 'approve' ? '审核通过' : '驳回文档'}
              </p>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>
                {modal.type === 'delete' && <>确定要删除 <strong style={{ color: '#0f172a' }}>{modal.doc.title}</strong> 吗？此操作不可撤销。</>}
                {modal.type === 'approve' && <>确认通过 <strong style={{ color: '#0f172a' }}>{modal.doc.title}</strong> 的审核？</>}
                {modal.type === 'reject' && <>确认驳回 <strong style={{ color: '#0f172a' }}>{modal.doc.title}</strong>？</>}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <button onClick={() => setModal(null)} disabled={acting}
                  style={{ padding: '8px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
                <button onClick={() => doAction(modal.doc.id, modal.type === 'delete' ? 'delete' : 'approve', modal.type === 'reject' ? { status: 'rejected', comment: '' } : undefined)} disabled={acting}
                  style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: modal.type === 'delete' || modal.type === 'reject' ? '#ef4444' : '#10b981' }}>
                  {acting ? '处理中...' : modal.type === 'delete' ? '确认删除' : modal.type === 'approve' ? '确认通过' : '确认驳回'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
