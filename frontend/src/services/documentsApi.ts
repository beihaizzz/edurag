import api from './api'
import type { APIResponse, PaginatedResponse } from '../types/api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CourseInfo {
  id: number
  name: string
  code: string | null
}

export interface DocumentInfo {
  id: number
  title: string
  filename: string
  file_type: string
  file_size: number
  file_path: string
  status: string
  processing_status: string
  course_id: number | null
  course_name: string | null
  description: string | null
  tags: string[] | null
  uploader_id: number
  uploader_name: string
  created_at: string
  updated_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 解包 APIResponse，code ≠ 0 时抛错 */
function unwrap<T>(res: APIResponse<T>): T {
  if (res.code !== 0 || res.data == null) {
    throw new Error(res.message || '请求失败')
  }
  return res.data
}

// ─── Documents API ───────────────────────────────────────────────────────────

/** 上传文档（multipart/form-data） */
export const uploadDocument = async (
  file: File,
  metadata: {
    title: string
    file_type: string
    course_id?: number
    description?: string
    tags?: string[]
  },
): Promise<DocumentInfo> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', metadata.title)
  formData.append('file_type', metadata.file_type)
  if (metadata.course_id != null) formData.append('course_id', String(metadata.course_id))
  if (metadata.description) formData.append('description', metadata.description)
  if (metadata.tags && metadata.tags.length > 0) {
    metadata.tags.forEach((t) => formData.append('tags', t))
  }

  const res = await api.post<APIResponse<DocumentInfo>>('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return unwrap(res.data)
}


/** 获取文档列表（分页） */
export const listDocuments = async (
  params?: {
    course_id?: number
    file_type?: string
    status?: string
    page?: number
    page_size?: number
  },
): Promise<PaginatedResponse<DocumentInfo>> => {
  const res = await api.get<APIResponse<PaginatedResponse<DocumentInfo>>>('/documents', {
    params,
  })
  return unwrap(res.data)
}

/** 获取文档详情 */
export const getDocument = async (id: number): Promise<DocumentInfo> => {
  const res = await api.get<APIResponse<DocumentInfo>>(`/documents/${id}`)
  return unwrap(res.data)
}

/** 更新文档信息 */
export const updateDocument = async (
  id: number,
  data: Partial<Pick<DocumentInfo, 'title' | 'description' | 'tags'>>,
): Promise<DocumentInfo> => {
  const res = await api.put<APIResponse<DocumentInfo>>(`/documents/${id}`, data)
  return unwrap(res.data)
}

/** 删除文档 */
export const deleteDocument = async (id: number): Promise<void> => {
  const res = await api.delete<APIResponse<null>>(`/documents/${id}`)
  unwrap(res.data)
}

/** 触发文档处理（解析 + 向量化） */
export const processDocument = async (id: number): Promise<DocumentInfo> => {
  const res = await api.post<APIResponse<DocumentInfo>>(`/documents/${id}/process`)
  return unwrap(res.data)
}

/** 审核文档（管理员专用） */
export const approveDocument = async (
  id: number,
  data: { status: string; comment?: string },
): Promise<DocumentInfo> => {
  const res = await api.post<APIResponse<DocumentInfo>>(`/documents/${id}/approve`, data)
  return unwrap(res.data)
}

// ─── Courses API ─────────────────────────────────────────────────────────────

/** 获取课程列表（供下拉选择使用） */
export const getCourses = async (): Promise<CourseInfo[]> => {
  const res = await api.get<APIResponse<CourseInfo[]>>('/courses')
  return unwrap(res.data)
}

// ─── Statistics API ──────────────────────────────────────────────────────────

export interface DocumentStatistics {
  total: number
  pending: number
  approved: number
  rejected: number
  processing: number
  failed: number
}

/** 获取文档统计（教师看自己的，admin 看全部） */
export const getDocumentStatistics = async (): Promise<DocumentStatistics> => {
  const res = await api.get<APIResponse<DocumentStatistics>>('/documents/statistics')
  return unwrap(res.data)
}
