import { useAuthStore } from '../stores/authStore'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const loading = useAuthStore((s) => s.loading)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const register = useAuthStore((s) => s.register)
  const setUser = useAuthStore((s) => s.setUser)

  return {
    user,
    isAuthenticated,
    token,
    loading,
    login,
    logout,
    register,
    setUser,
    /** 当前用户角色 */
    role: user?.role ?? null,
    /** 是否为管理员 */
    isAdmin: user?.role === 'admin',
    /** 是否为教师 */
    isTeacher: user?.role === 'teacher',
    /** 是否为学生 */
    isStudent: user?.role === 'student',
  }
}
