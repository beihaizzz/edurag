import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '../types/api'
import * as authApi from '../services/authApi'

interface AuthState {
  user: UserInfo | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  loading: boolean

  login: (username: string, password: string) => Promise<UserInfo>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  resetPassword: (newPassword: string) => Promise<void>
  setUser: (user: UserInfo) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      loading: false,

      login: async (username: string, password: string) => {
        const res = await authApi.login(username, password)
        if (res.code !== 0 || !res.data) throw new Error(res.message || '登录失败')
        const { access_token, refresh_token, user } = res.data
        set({
          user,
          token: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
        })
        return user
      },

      register: async (username: string, password: string) => {
        const res = await authApi.register(username, password)
        if (res.code !== 0) throw new Error(res.message || '注册失败')
      },

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        })
      },

      fetchUser: async () => {
        try {
          set({ loading: true })
          const res = await authApi.getCurrentUser()
          if (res.code === 0 && res.data?.user) {
            set({ user: res.data.user, isAuthenticated: true })
          }
        } catch {
          set({ isAuthenticated: false })
        } finally {
          set({ loading: false })
        }
      },

      changePassword: async (oldPassword: string, newPassword: string) => {
        const res = await authApi.changePassword(oldPassword, newPassword)
        if (res.code !== 0) throw new Error(res.message || '修改密码失败')
      },

      resetPassword: async (newPassword: string) => {
        const res = await authApi.resetPassword(newPassword)
        if (res.code !== 0) throw new Error(res.message || '重置密码失败')
        get().logout()
      },

      setUser: (user: UserInfo) => {
        set({ user })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
