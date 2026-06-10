/** 通用 API 响应格式 */
export interface APIResponse<T = unknown> {
  code: number
  message: string
  data: T | null
}

/** 用户信息 */
export interface UserInfo {
  id: number
  username: string
  role: 'student' | 'teacher' | 'admin'
  real_name: string
  email: string | null
  force_password_change: boolean
  is_active: boolean
  created_at: string | null
}

/** 登录响应 */
export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: UserInfo
  require_password_change?: boolean
}

/** 分页参数 */
export interface PaginationParams {
  page?: number
  page_size?: number
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
