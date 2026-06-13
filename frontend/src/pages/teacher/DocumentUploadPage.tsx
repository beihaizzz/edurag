import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import type { APIResponse } from '../../types/api'

interface CourseItem { id: number; name: string }

const FILE_TYPES = [
  { value: 'courseware', label: '课件' },
  { value: 'lab_guide', label: '实验指导' },
  { value: 'assignment', label: '作业' },
  { value: 'reference', label: '参考资料' },
  { value: 'other', label: '其他' },
]
const MAX_SIZE_MB = 50

const css = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .tu-anim { animation: fadeInUp 0.4s ease-out both; }
  .tu-upload-zone { transition: all 0.25s ease; }
  .tu-upload-zone.drag-over { border-color: #6366F1; background: #EEF2FF; }
  .tu-input-focus:focus-within { box-shadow: 0 0 0 3px rgba(99,102,241,0.12); border-color: #A5B4FC; }
`

export default function DocumentUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [fileType, setFileType] = useState('')
  const [courseId, setCourseId] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [courses, setCourses] = useState<CourseItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<APIResponse<{ items: CourseItem[] }>>('/courses', { params: { page: 1, page_size: 100 } })
      .then((r) => { if (r.data.code === 0 && r.data.data) setCourses(r.data.data.items ?? []) })
      .catch(() => {})
  }, [])

  const handleFile = (f: File) => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { setError(`文件不能超过 ${MAX_SIZE_MB}MB`); return }
    setFile(f); setError('')
  }

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]) }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput('') }
  }

  const handleSubmit = async () => {
    if (!file) { setError('请选择文件'); return }
    if (!title.trim()) { setError('请输入资料标题'); return }
    if (!fileType) { setError('请选择资料类型'); return }

    setSubmitting(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', title.trim())
      form.append('file_type', fileType)
      if (courseId) form.append('course_id', courseId)
      if (description.trim()) form.append('description', description.trim())
      form.append('tags', JSON.stringify(tags))
      const r = await api.post<APIResponse<unknown>>('/documents', form)
      if (r.data.code === 0) {
        setSuccess(true)
        refreshDashboard.trigger()
        setTimeout(() => navigate('/teacher/documents'), 1500)
      } else {
        setError(r.data.message || '上传失败')
        setSubmitting(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传失败，请重试')
      setSubmitting(false)
    }
  }

  const courseList = courses.length > 0 ? courses : [
    { id: 1, name: '大学物理' },{ id: 2, name: '高等数学' },{ id: 3, name: '程序设计' },
    { id: 4, name: '操作系统' },{ id: 5, name: '数据结构' },{ id: 6, name: '深度学习' },
    { id: 7, name: '软件工程' },{ id: 8, name: '数字图像处理' },{ id: 9, name: 'Unity开发' },
  ]

  return (
    <>
      <style>{css}</style>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <div className="tu-anim" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/teacher/documents')}
            style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#475569' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none"><path d="M13 16l-6-6 6-6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>上传课程资料</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '2px 0 0' }}>提交后资料将进入审核流程</p>
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="tu-anim" style={{ padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} /><path d="M8 5v3.5M8 11h0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
            {error}
          </div>
        )}
        {success && (
          <div className="tu-anim" style={{ padding: 12, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} /><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
            上传成功！即将跳转到文档管理...
          </div>
        )}

        {/* Form */}
        <div className="tu-anim" style={{ animationDelay: '0.05s', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>

          {/* File Upload Zone */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 8 }}>选择文件</label>
            <div
              className={`tu-upload-zone${dragOver ? ' drag-over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: '2px dashed #e2e8f0', borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
                borderColor: dragOver ? '#6366F1' : '#e2e8f0', background: dragOver ? '#EEF2FF' : 'transparent',
              }}>
              <svg width={48} height={48} viewBox="0 0 48 48" fill="none" style={{ color: '#cbd5e1', margin: '0 auto 16px' }}>
                <path d="M24 8v24M10 24h28" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
                <rect x={6} y={32} width={36} height={12} rx={2} stroke="currentColor" strokeWidth={2} />
              </svg>
              <p style={{ fontSize: 14, color: '#475569', fontWeight: 500, margin: 0 }}>点击或拖拽文件到此区域</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>支持 PDF、DOCX、PPTX、TXT、MD、XLSX，单个文件不超过 50MB</p>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md,.xlsx" hidden
                onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files[0]) }} />
            </div>

            {file && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#EEF2FF', borderRadius: 8 }}>
                <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{ color: '#4F46E5' }}><path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth={1.5} /><path d="M12 3v4h4" stroke="currentColor" strokeWidth={1.5} /></svg>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#4338CA' }}>{file.name}</span>
                <span style={{ fontSize: 12, color: '#6366F1', marginLeft: 'auto' }}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#818CF8' }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', margin: '0 -24px 24px' }} />

          {/* Title */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}>资料标题 <span style={{ color: '#ef4444' }}>*</span></label>
            <div className="tu-input-focus" style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', transition: 'all 0.2s' }}>
              <input type="text" placeholder="例如：高等数学第一章课件" value={title} onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '10px 16px', border: 'none', outline: 'none', fontSize: 14, color: '#0f172a', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Type + Course */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}>资料类型 <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={fileType} onChange={(e) => setFileType(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#334155', background: '#fff', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">选择资料类型</option>
                {FILE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}>关联课程</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#334155', background: '#fff', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                <option value="">选择课程（可选）</option>
                {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}>资料描述</label>
            <textarea rows={3} placeholder="简要描述资料内容、适用章节等信息（可选）" value={description} onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}>标签</label>
            <div className="tu-input-focus" style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', transition: 'all 0.2s' }}>
              <input type="text" placeholder="输入标签后按回车添加" value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                style={{ width: '100%', padding: '10px 16px', border: 'none', outline: 'none', fontSize: 14, color: '#0f172a', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {tags.map((t, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px', borderRadius: 99, background: '#EEF2FF', color: '#4F46E5', fontWeight: 500 }}>
                    {t}
                    <button onClick={() => setTags(tags.filter((_, j) => j !== i))}
                      style={{ color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#818CF8' }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Submit Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>提交后资料将进入审核流程</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => navigate('/teacher/documents')}
                style={{ padding: '10px 20px', fontSize: 14, color: '#64748b', fontWeight: 500, borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleSubmit} disabled={submitting || success}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 32px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, cursor: (submitting || success) ? 'not-allowed' : 'pointer', opacity: (submitting || success) ? 0.6 : 1, background: success ? '#10b981' : '#4338CA', color: '#fff' }}
                onMouseEnter={(e) => { if (!submitting && !success) { e.currentTarget.style.background = '#3730A3'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(67,56,202,0.35)' } }}
                onMouseLeave={(e) => { if (!submitting && !success) { e.currentTarget.style.background = '#4338CA'; e.currentTarget.style.boxShadow = 'none' } }}>
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none"><path d="M5 17l10-7L5 3v5.5L11 10 5 11.5V17z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                {submitting ? '提交中...' : success ? '提交成功 ✓' : '提交'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
