import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const navItems = [
  { path: '/student', label: '首页' },
  { path: '/student/search', label: '课程搜索' },
  { path: '/student/qa', label: 'AI 问答' },
  { path: '/student/history', label: '问答历史' },
]

export default function StudentLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const css = `
    .snl-nav-link { position: relative; }
    .snl-nav-link::after {
      content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
      background: #6366F1; transform: scaleX(0); transition: transform 0.2s ease;
    }
    .snl-nav-link:hover::after,
    .snl-nav-link.snl-active::after { transform: scaleX(1); }
  `

  const isActive = (path: string) => location.pathname === path

  return (
    <>
      <style>{css}</style>

      {/* Top Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{
          maxWidth: 1152, margin: '0 auto', padding: '0 24px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <div
            onClick={() => navigate('/student')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}
          >
            <img src="/favicon.svg" alt="EduRAG" style={{ width: 32, height: 28 }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              EduRAG
            </span>
          </div>

          {/* Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {navItems.map((item) => (
              <button
                key={item.path}
                className={`snl-nav-link${isActive(item.path) ? ' snl-active' : ''}`}
                onClick={() => navigate(item.path)}
                style={{
                  padding: '8px 16px', fontSize: 14, fontWeight: 500,
                  color: isActive(item.path) ? '#4F46E5' : '#64748b',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* User */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#64748b', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#EEF2FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
                  <circle cx={10} cy={7} r={3.5} stroke="#6366F1" strokeWidth={1.5} />
                  <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" />
                </svg>
              </div>
              <span style={{ fontWeight: 500, color: '#334155' }}>{user?.real_name || user?.username}</span>
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" style={{ color: '#94a3b8' }}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Dropdown */}
            {menuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8,
                background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                boxShadow: '0 8px 30px rgba(0,0,0,0.08)', minWidth: 160,
                overflow: 'hidden', zIndex: 100,
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{user?.real_name || user?.username}</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0 0' }}>{user?.username}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/change-password') }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, color: '#334155',
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
                    <path d="M8 17.3V3.7c0-.4.4-.7.8-.5l8.2 6.5c.4.3.4.8 0 1.1l-8.2 6.5c-.4.2-.8-.1-.8-.5z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 2H4.5A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18H7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                  </svg>
                  修改密码
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, color: '#ef4444',
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    borderTop: '1px solid #f1f5f9',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
                    <path d="M7 17H4.5A1.5 1.5 0 013 15.5V4.5A1.5 1.5 0 014.5 3H7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                    <path d="M12 14l3-4-3-4M15 10H7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <Outlet />
    </>
  )
}
