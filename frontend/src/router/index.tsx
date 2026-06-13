import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from '../components/AuthGuard'
import StudentLayout from '../components/StudentLayout'
import TeacherLayout from '../components/TeacherLayout'
import AdminLayout from '../components/AdminLayout'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import ChangePasswordPage from '../pages/auth/ChangePasswordPage'

import StudentHomePage from '../pages/student/StudentHomePage'
import SearchPage from '../pages/student/SearchPage'
import QAPage from '../pages/student/QAPage'
import QAHistory from '../pages/student/QAHistory'

import TeacherHomePage from '../pages/teacher/TeacherHomePage'
import DocumentUploadPage from '../pages/teacher/DocumentUploadPage'
import DocumentListPage from '../pages/teacher/DocumentListPage'

import AdminHomePage from '../pages/admin/AdminHomePage'
import ReviewList from '../pages/admin/ReviewList'
import UserManage from '../pages/admin/UserManage'

const router = createBrowserRouter([
  // ── 公开路由 ──
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  // ── 需要登录 ──
  {
    element: <AuthGuard />,
    children: [
      { path: '/change-password', element: <ChangePasswordPage /> },

      // ── 学生端（顶部导航栏布局） ──
      {
        element: <AuthGuard role="student" />,
        children: [
          {
            element: <StudentLayout />,
            children: [
              { path: '/student', element: <StudentHomePage /> },
              { path: '/student/search', element: <SearchPage /> },
              { path: '/student/qa', element: <QAPage /> },
              { path: '/student/history', element: <QAHistory /> },
            ],
          },
        ],
      },

      // ── 教师端（顶部导航栏布局） ──
      {
        element: <AuthGuard role="teacher" />,
        children: [
          {
            element: <TeacherLayout />,
            children: [
              { path: '/teacher', element: <TeacherHomePage /> },
              { path: '/teacher/documents/upload', element: <DocumentUploadPage /> },
              { path: '/teacher/documents', element: <DocumentListPage /> },
            ],
          },
        ],
      },

      // ── 管理端（顶部导航栏布局） ──
      {
        element: <AuthGuard role="admin" />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: '/admin', element: <AdminHomePage /> },
              { path: '/admin/review', element: <ReviewList /> },
              { path: '/admin/users', element: <UserManage /> },
              // 管理端也能访问教师文档管理
              { path: '/teacher/documents/upload', element: <DocumentUploadPage /> },
              { path: '/teacher/documents', element: <DocumentListPage /> },
            ],
          },
        ],
      },
    ],
  },

  // ── 兜底 ──
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
])

export default router
