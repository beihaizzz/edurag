import { useState, useEffect } from 'react'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import type { APIResponse, PaginatedResponse } from '../../types/api'

interface DocItem { id: number; title: string; filename: string; file_type: string; processing_status: string; status: string }
interface DocDetail extends DocItem { description: string; tags: string[]; file_size: number; course: { id: number; name: string } | null; uploader: { id: number; real_name: string } | null; chunks_preview: { chunk_index: number; content: string; char_count: number }[] }

const TYPE_LABELS: Record<string, string> = { courseware: '课件', lab_guide: '实验指导', assignment: '作业', reference: '参考资料', other: '其他' }
const TYPE_COLORS: Record<string, string> = { courseware: '#3b82f6', lab_guide: '#06b6d4', assignment: '#f97316', reference: '#8b5cf6', other: '#64748b' }

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ar-anim { animation: fadeInUp 0.4s ease-out both; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ar-spin { animation: spin 0.8s linear infinite; }
`

export default function ReviewList() {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: string; doc: DocItem } | null>(null)
  const [acting, setActing] = useState(false)
  const [viewDoc, setViewDoc] = useState<DocDetail | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const pageSize = 10

  const load = async (p: number) => {
    setLoading(true)
    try {
      const r = await api.get<APIResponse<PaginatedResponse<DocItem>>>('/documents', { params: { page: p, page_size: pageSize, status: 'pending' } })
      if (r.data.code === 0 && r.data.data) {
        setDocs(r.data.data.items ?? [])
        setTotal(r.data.data.total)
        setPage(p)
        setTotalPages(r.data.data.total_pages)
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [])

  const openView = async (id: number) => {
    setViewLoading(true); setViewDoc(null)
    try {
      const r = await api.get<APIResponse<DocDetail>>(`/documents/${id}`)
      if (r.data.code === 0 && r.data.data) setViewDoc(r.data.data)
    } catch { /* */ }
    finally { setViewLoading(false) }
  }

  const doAudit = async (id: number, status: string) => {
    setActing(true)
    try {
      await api.post(`/documents/${id}/approve`, { status, comment: '' })
      refreshDashboard.trigger()
      load(page)
    } catch { /* */ }
    finally { setModal(null); setActing(false) }
  }

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div className="ar-anim" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>文档审核</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>审核教师上传的课程资料，通过后学生即可检索</p>
        </div>

        <div className="ar-anim" style={{ animationDelay: '0.05s', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: total > 0 ? '#f59e0b' : '#10b981', animation: total > 0 ? 'fadeInUp 0.8s ease-in-out infinite alternate' : 'none' }} />
          <span style={{ fontSize: 14, color: '#64748b' }}>当前共 <span style={{ fontWeight: 600, color: '#334155' }}>{total}</span> 份文档待审核</span>
        </div>

        <div className="ar-anim" style={{ animationDelay: '0.08s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 64 }}>ID</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>文档名称</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 176 }}>文件名</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 96 }}>类型</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 96 }}>处理状态</th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 224 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
                ) : docs.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>暂无待审核文档</td></tr>
                ) : docs.map((doc) => (
                  <tr key={doc.id} style={{ transition: 'background 0.2s', borderTop: '1px solid #f8fafc' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>#{doc.id}</td>
                    <td style={{ padding: '14px 20px', fontWeight: 500, color: '#1e293b' }}>{doc.title}</td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: '#64748b' }}>{doc.filename}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (TYPE_COLORS[doc.file_type] || '#64748b') + '18', color: TYPE_COLORS[doc.file_type] || '#64748b' }}>{TYPE_LABELS[doc.file_type] || doc.file_type}</span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {doc.processing_status === 'processing' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: '#EFF6FF', color: '#2563EB' }}>
                          <span className="ar-spin" style={{ width: 10, height: 10, border: '2px solid #BFDBFE', borderTopColor: '#3B82F6', borderRadius: '50%', display: 'inline-block' }} />
                          处理中
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: '#f1f5f9', color: '#64748b' }}>未处理</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openView(doc.id)}
                          style={{ fontSize: 12, color: '#6366F1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 6 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>查看</button>
                        {doc.processing_status !== 'processing' ? (
                          <>
                            <button onClick={() => setModal({ type: 'approve', doc })}
                              style={{ fontSize: 12, color: '#10b981', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 6 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#ECFDF5' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>通过</button>
                            <button onClick={() => setModal({ type: 'reject', doc })}
                              style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 6 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>驳回</button>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: '#cbd5e1', padding: '6px 10px' }}>处理中...</span>
                        )}
                      </div>
                    </td>
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

        {/* View Modal */}
        {(viewDoc || viewLoading) && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={() => { setViewDoc(null); setViewLoading(false) }}>
            <div style={{ background: '#fff', borderRadius: 12, maxWidth: 680, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              {viewLoading ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>加载中...</div>
              ) : viewDoc ? (
                <>
                  {/* Header */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{viewDoc.title}</h3>
                    <button onClick={() => { setViewDoc(null); setViewLoading(false) }}
                      style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 20, lineHeight: 1 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#475569' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}>×</button>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px 24px' }}>
                    {/* Meta */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>文件名</span>
                        <p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.filename}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>类型</span>
                        <p style={{ margin: '4px 0 0 0' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: (TYPE_COLORS[viewDoc.file_type] || '#64748b') + '18', color: TYPE_COLORS[viewDoc.file_type] || '#64748b' }}>{TYPE_LABELS[viewDoc.file_type] || viewDoc.file_type}</span>
                        </p>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>课程</span>
                        <p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.course?.name || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>上传者</span>
                        <p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{viewDoc.uploader?.real_name || '—'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>文件大小</span>
                        <p style={{ fontSize: 14, color: '#334155', margin: '4px 0 0 0' }}>{(viewDoc.file_size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>处理状态</span>
                        <p style={{ margin: '4px 0 0 0' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500, background: '#f1f5f9', color: '#64748b' }}>待审核</span>
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    {viewDoc.description && (
                      <div style={{ marginBottom: 20 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>描述</span>
                        <p style={{ fontSize: 14, color: '#475569', margin: '4px 0 0 0', lineHeight: 1.6 }}>{viewDoc.description}</p>
                      </div>
                    )}

                    {/* Tags */}
                    {viewDoc.tags && viewDoc.tags.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>标签</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {viewDoc.tags.map((t, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: '#EEF2FF', color: '#4F46E5', fontWeight: 500 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chunks Preview */}
                    {viewDoc.chunks_preview && viewDoc.chunks_preview.length > 0 && (
                      <div>
                        <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 8 }}>内容预览（前 {viewDoc.chunks_preview.length} 段）</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {viewDoc.chunks_preview.map((chunk, ci) => (
                            <div key={ci} style={{
                              padding: '12px 16px', background: '#f8fafc', borderRadius: 8,
                              borderLeft: '3px solid #6366F1', fontSize: 13, color: '#475569', lineHeight: 1.6,
                            }}>
                              <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 8 }}>#{chunk.chunk_index}</span>
                              {chunk.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={async () => {
                        try {
                          const r = await api.get(`/documents/${viewDoc.id}/file`, { responseType: 'blob' })
                          const url = URL.createObjectURL(r.data)
                          window.open(url, '_blank')
                        } catch { /* */ }
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#6366F1', borderRadius: 8, border: '1px solid #C7D2FE', background: '#fff', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#EEF2FF' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M2 3h12v10H2V3z" stroke="currentColor" strokeWidth={1.5} /><path d="M6 6h4M6 9h2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                      预览文件
                    </button>
                    <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => { setViewDoc(null); setViewLoading(false) }}
                      style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, color: '#64748b', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>关闭</button>
                    {viewDoc.processing_status !== 'processing' && (
                      <>
                        <button onClick={() => { setViewDoc(null); setModal({ type: 'reject', doc: viewDoc }) }}
                          style={{ padding: '8px 20px', fontSize: 14, fontWeight: 500, color: '#ef4444', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer' }}>驳回</button>
                        <button onClick={() => { setViewDoc(null); setModal({ type: 'approve', doc: viewDoc }) }}
                          style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#10b981' }}>审核通过</button>
                      </>
                    )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {modal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setModal(null)}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={(e) => e.stopPropagation()}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>
                {modal.type === 'approve' ? '审核通过' : '驳回文档'}
              </p>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>
                {modal.type === 'approve' ? <>确认通过 <strong>{modal.doc.title}</strong> 的审核？</> : <>确认驳回 <strong>{modal.doc.title}</strong>？</>}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setModal(null)} disabled={acting}
                  style={{ padding: '8px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
                <button onClick={() => doAudit(modal.doc.id, modal.type === 'approve' ? 'approved' : 'rejected')} disabled={acting}
                  style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: modal.type === 'approve' ? '#10b981' : '#ef4444' }}>
                  {acting ? '处理中...' : modal.type === 'approve' ? '确认通过' : '确认驳回'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
