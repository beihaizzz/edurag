import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface AuthGuardProps {
  /** 要求的角色，不指定则仅要求登录 */
  role?: 'student' | 'teacher' | 'admin'
}

/** 路由守卫：未登录 → /login，角色不匹配 → 重定向到对应用户首页 */
export default function AuthGuard({ role }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (role && user?.role !== role) {
    return <Navigate to={`/${user?.role}`} replace />
  }

  return <Outlet />
}
