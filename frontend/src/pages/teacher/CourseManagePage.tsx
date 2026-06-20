import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../../services/documentsApi'
import type { CourseInfo } from '../../services/documentsApi'

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .cm-anim { animation: fadeInUp 0.4s ease-out both; }
  .cm-modal-overlay { animation: fadeInUp 0.15s ease-out; }
`

export default function CourseManagePage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form modal (create / edit)
  const [formModal, setFormModal] = useState<{
    open: boolean
    edit?: CourseInfo
  }>({ open: false })
  const [formData, setFormData] = useState({
    name: '',
    semester: '',
    description: '',
  })
  const [formErrors, setFormErrors] = useState({ name: '', semester: '' })
  const [submitting, setSubmitting] = useState(false)

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<CourseInfo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadCourses = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getCourses()
      setCourses(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载课程失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCourses()
  }, [])

  // ── Form modal ──

  const openCreateModal = () => {
    setFormData({ name: '', semester: '', description: '' })
    setFormErrors({ name: '', semester: '' })
    setFormModal({ open: true })
  }

  const openEditModal = (course: CourseInfo) => {
    setFormData({
      name: course.name,
      semester: course.semester,
      description: '',
    })
    setFormErrors({ name: '', semester: '' })
    setFormModal({ open: true, edit: course })
  }

  const closeFormModal = () => {
    setFormModal({ open: false })
    setSubmitting(false)
  }

  const validate = (): boolean => {
    const errors = { name: '', semester: '' }
    if (!formData.name.trim()) errors.name = '请输入课程名称'
    if (!formData.semester.trim()) errors.semester = '请输入学期'
    setFormErrors(errors)
    return !errors.name && !errors.semester
  }

  const handleFormSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      if (formModal.edit) {
        await updateCourse(formModal.edit.id, {
          name: formData.name.trim(),
          semester: formData.semester.trim(),
          description: formData.description.trim() || undefined,
        })
      } else {
        await createCourse({
          name: formData.name.trim(),
          semester: formData.semester.trim(),
          description: formData.description.trim() || undefined,
        })
      }
      closeFormModal()
      await loadCourses()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete modal ──

  const openDeleteModal = (course: CourseInfo) => {
    setDeleteTarget(course)
  }

  const closeDeleteModal = () => {
    setDeleteTarget(null)
    setDeleting(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCourse(deleteTarget.id)
      closeDeleteModal()
      await loadCourses()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败')
      setDeleting(false)
    }
  }

  // ── Helpers ──

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('zh-CN') : ''

  // ── Render ──

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>
        {/* Error banner */}
        {error && (
          <div
            className="cm-anim"
            style={{
              padding: 12,
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} />
              <path d="M8 5v3.5M8 11h0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
            {error}
            <button
              onClick={() => setError('')}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#b91c1c',
                fontSize: 16,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Header */}
        <div
          className="cm-anim"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              课程管理
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
              创建和管理你的授课课程
            </p>
          </div>
          <button
            onClick={openCreateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: '#4338CA',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3730A3'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(67,56,202,0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4338CA'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
            创建课程
          </button>
        </div>

        {/* Table */}
        <div
          className="cm-anim"
          style={{
            animationDelay: '0.1s',
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b' }}>
                    课程名称
                  </th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 160 }}>
                    学期
                  </th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 120 }}>
                    授课教师
                  </th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 80 }}>
                    资料数
                  </th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 176 }}>
                    创建时间
                  </th>
                  <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 500, color: '#64748b', width: 160 }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}
                    >
                      加载中...
                    </td>
                  </tr>
                ) : courses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}
                    >
                      暂无课程，点击右上角创建
                    </td>
                  </tr>
                ) : (
                  courses.map((course) => (
                    <tr
                      key={course.id}
                      style={{ transition: 'background 0.2s', borderTop: '1px solid #f8fafc' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f8fafc'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <td style={{ padding: '14px 20px', fontWeight: 500, color: '#1e293b' }}>
                        {course.name}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#64748b' }}>
                        {course.semester}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#64748b' }}>
                        {course.teacher?.real_name || '—'}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>
                        {course.document_count}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: '#94a3b8' }}>
                        {fmtDate(course.created_at)}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => openEditModal(course)}
                            style={{
                              fontSize: 12,
                              color: '#4F46E5',
                              fontWeight: 500,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#EEF2FF'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            编辑
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => openDeleteModal(course)}
                              style={{
                                fontSize: 12,
                                color: '#ef4444',
                                fontWeight: 500,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#FEF2F2'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Create / Edit Modal ── */}
        {formModal.open && (
          <div
            className="cm-modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.3)',
            }}
            onClick={closeFormModal}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 24,
                maxWidth: 480,
                width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: '0 0 20px',
                }}
              >
                {formModal.edit ? '编辑课程' : '创建课程'}
              </h3>

              {/* Course Name */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: 6,
                  }}
                >
                  课程名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${formErrors.name ? '#fca5a5' : '#e2e8f0'}`,
                    background: '#fff',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="text"
                    placeholder="输入课程名称"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value })
                      if (formErrors.name) setFormErrors({ ...formErrors, name: '' })
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: '#0f172a',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                {formErrors.name && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>
                    {formErrors.name}
                  </p>
                )}
              </div>

              {/* Semester */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: 6,
                  }}
                >
                  学期 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${formErrors.semester ? '#fca5a5' : '#e2e8f0'}`,
                    background: '#fff',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="text"
                    placeholder="例如：2025-2026-2"
                    value={formData.semester}
                    onChange={(e) => {
                      setFormData({ ...formData, semester: e.target.value })
                      if (formErrors.semester) setFormErrors({ ...formErrors, semester: '' })
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: '#0f172a',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                {formErrors.semester && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>
                    {formErrors.semester}
                  </p>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: 6,
                  }}
                >
                  课程描述
                </label>
                <textarea
                  rows={3}
                  placeholder="简要描述课程内容（可选）"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                    color: '#0f172a',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: 20,
                }}
              >
                <button
                  onClick={closeFormModal}
                  disabled={submitting}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    color: '#64748b',
                    fontWeight: 500,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleFormSubmit}
                  disabled={submitting}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                    color: '#fff',
                    background: '#4338CA',
                  }}
                  onMouseEnter={(e) => {
                    if (!submitting) {
                      e.currentTarget.style.background = '#3730A3'
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(67,56,202,0.35)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!submitting) {
                      e.currentTarget.style.background = '#4338CA'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {submitting ? '提交中...' : formModal.edit ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirm Modal ── */}
        {deleteTarget && (
          <div
            className="cm-modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.3)',
            }}
            onClick={closeDeleteModal}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 24,
                maxWidth: 400,
                width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#0f172a',
                  margin: '0 0 8px',
                }}
              >
                确认删除
              </p>
              <p
                style={{
                  fontSize: 14,
                  color: '#64748b',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                确定要删除课程{' '}
                <strong style={{ color: '#0f172a' }}>{deleteTarget.name}</strong>
                ？此操作不可撤销。
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 20,
                }}
              >
                <button
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    color: '#64748b',
                    fontWeight: 500,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                    color: '#fff',
                    background: '#ef4444',
                  }}
                >
                  {deleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
