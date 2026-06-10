import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

/** 从 zustand persist 存储中读取令牌 */
function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

function getRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.refreshToken ?? null
  } catch {
    return null
  }
}

function clearAuth() {
  localStorage.removeItem('auth-storage')
  window.location.href = '/login'
}

// ── 请求拦截器：自动附加 JWT ──────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// ── 响应拦截器：401 时尝试刷新令牌 ─────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true
      const refreshToken = getRefreshToken()

      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          })
          const body = res.data
          if (body.code === 0 && body.data) {
            const { access_token, refresh_token: newRefresh } = body.data

            // 更新 zustand persist 存储
            const raw = localStorage.getItem('auth-storage')
            if (raw) {
              const parsed = JSON.parse(raw)
              parsed.state.token = access_token
              parsed.state.refreshToken = newRefresh
              localStorage.setItem('auth-storage', JSON.stringify(parsed))
            }

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${access_token}`
            }
            return api(originalRequest)
          }
        } catch {
          clearAuth()
          return Promise.reject(error)
        }
      } else {
        clearAuth()
      }
    }

    return Promise.reject(error)
  },
)

export default api
