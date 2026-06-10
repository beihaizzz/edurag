import api from './api'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchedSnippet {
  chunk_id: string
  content: string
  score: number
}

export interface SearchResultItem {
  document_id: string
  title: string
  file_type: string
  course_name: string
  matched_snippets: MatchedSnippet[]
}

export interface SearchResponse {
  results: SearchResultItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
  mode: string
  query: string
}

export interface QASource {
  chunk_id: string
  document_id: string
  title: string
  score: number
}

export interface QAResponse {
  id: string
  question: string
  answer: string
  sources: QASource[]
  is_rejected: boolean
  latency_ms: number
}

export interface QAHistoryItem {
  id: string
  question: string
  answer: string
  sources: QASource[]
  is_rejected: boolean
  latency_ms: number
  created_at: string
}

export interface QAHistoryResponse {
  items: QAHistoryItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ─── API Functions ──────────────────────────────────────────────────────────

export interface SearchParams {
  q: string
  mode?: 'keyword' | 'semantic' | 'hybrid'
  course_id?: string
  page?: number
  page_size?: number
}

export interface AskQuestionParams {
  question: string
  course_id?: string
}

export interface QAHistoryParams {
  course_id?: string
  page?: number
  page_size?: number
}

/** 搜索文档 */
export const search = (params: SearchParams): Promise<SearchResponse> =>
  api.get('/search', { params }).then((r) => r.data.data)

/** 提问 */
export const askQuestion = (data: AskQuestionParams): Promise<QAResponse> =>
  api.post('/qa', data).then((r) => r.data.data)

/** 获取问答历史 */
export const getQAHistory = (params: QAHistoryParams): Promise<QAHistoryResponse> =>
  api.get('/qa', { params }).then((r) => r.data.data)

/** 获取单个问答详情 */
export const getQADetail = (id: string): Promise<QAResponse> =>
  api.get(`/qa/${id}`).then((r) => r.data.data)
