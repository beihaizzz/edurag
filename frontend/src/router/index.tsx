import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from '../components/AuthGuard'
import Layout from '../components/Layout'
import StudentLayout from '../components/StudentLayout'
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
import Dashboard from '../pages/admin/Dashboard'

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

      // ── 教师/管理员（侧边栏布局） ──
      {
        element: <Layout />,
        children: [
          // 通用检索与问答
          { path: '/search', element: <SearchPage /> },
          { path: '/qa', element: <QAPage /> },
          { path: '/qa/:id', element: <QAPage /> },

          // 教师端
          {
            element: <AuthGuard role="teacher" />,
            children: [
              { path: '/teacher', element: <TeacherHomePage /> },
              { path: '/teacher/documents/upload', element: <DocumentUploadPage /> },
              { path: '/teacher/documents', element: <DocumentListPage /> },
            ],
          },

          // 管理端也能访问文档管理
          {
            element: <AuthGuard role="admin" />,
            children: [
              { path: '/teacher/documents/upload', element: <DocumentUploadPage /> },
              { path: '/teacher/documents', element: <DocumentListPage /> },
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

  // ── 兜底 ──
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
])

export default router
