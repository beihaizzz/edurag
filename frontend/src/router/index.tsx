import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from '../components/AuthGuard'
import Layout from '../components/Layout'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import ChangePasswordPage from '../pages/auth/ChangePasswordPage'

// 学生页面
import StudentHomePage from '../pages/student/StudentHomePage'
import SearchResults from '../pages/student/SearchResults'
import QAHistory from '../pages/student/QAHistory'
import QADetail from '../pages/student/QADetail'

// 教师页面
import TeacherHomePage from '../pages/teacher/TeacherHomePage'
import UploadDocument from '../pages/teacher/UploadDocument'
import DocumentManage from '../pages/teacher/DocumentManage'

// 管理员页面
import AdminHomePage from '../pages/admin/AdminHomePage'
import ReviewList from '../pages/admin/ReviewList'
import UserManage from '../pages/admin/UserManage'
import Dashboard from '../pages/admin/Dashboard'

const router = createBrowserRouter([
  // ── 公开路由 ────────────────────────────────────
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  // ── 需要登录 ─────────────────────────────────────
  {
    element: <AuthGuard />,
    children: [
      { path: '/change-password', element: <ChangePasswordPage /> },

      // ── 带 Layout 的路由 ──────────────────────────
      {
        element: <Layout />,
        children: [
          // 学生端
          {
            element: <AuthGuard role="student" />,
            children: [
              { path: '/student', element: <StudentHomePage /> },
              { path: '/student/search', element: <SearchResults /> },
              { path: '/student/qa', element: <QAHistory /> },
              { path: '/student/qa/:id', element: <QADetail /> },
            ],
          },

          // 教师端
          {
            element: <AuthGuard role="teacher" />,
            children: [
              { path: '/teacher', element: <TeacherHomePage /> },
              { path: '/teacher/upload', element: <UploadDocument /> },
              { path: '/teacher/documents', element: <DocumentManage /> },
            ],
          },

          // 管理端
          {
            element: <AuthGuard role="admin" />,
            children: [
              { path: '/admin', element: <AdminHomePage /> },
              { path: '/admin/review', element: <ReviewList /> },
              { path: '/admin/users', element: <UserManage /> },
              { path: '/admin/dashboard', element: <Dashboard /> },
            ],
          },
        ],
      },
    ],
  },

  // ── 兜底 ────────────────────────────────────────
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
])

export default router
