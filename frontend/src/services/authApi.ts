import api from './api'
import type { APIResponse, LoginResponse, UserInfo } from '../types/api'

/** 用户注册 */
export const register = (
  username: string,
  password: string,
): Promise<APIResponse<{ user: UserInfo }>> =>
  api.post('/auth/register', { username, password }).then((r) => r.data)

/** 用户登录 */
export const login = (
  username: string,
  password: string,
): Promise<APIResponse<LoginResponse>> =>
  api.post('/auth/login', { username, password }).then((r) => r.data)

/** 刷新令牌 */
export const refreshToken = (
  refresh_token: string,
): Promise<APIResponse<LoginResponse>> =>
  api.post('/auth/refresh', { refresh_token }).then((r) => r.data)

/** 获取当前用户信息（后端返回 data.user） */
export const getCurrentUser = (): Promise<APIResponse<{ user: UserInfo }>> =>
  api.get('/auth/me').then((r) => r.data)

/** 修改密码 */
export const changePassword = (
  old_password: string,
  new_password: string,
): Promise<APIResponse<null>> =>
  api.put('/auth/password', { old_password, new_password }).then((r) => r.data)

/** 强制重置密码（force_password_change 时使用） */
export const resetPassword = (
  new_password: string,
): Promise<APIResponse<null>> =>
  api.post('/auth/reset-password', { new_password }).then((r) => r.data)
