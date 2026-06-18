import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const navItems = [
  { path: '/teacher', label: '工作台' },
  { path: '/teacher/documents/upload', label: '上传资料' },
  { path: '/teacher/documents', label: '文档管理' },
]

export default function TeacherLayout() {
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

  const isActive = (path: string) => location.pathname === path
  const handleLogout = () => { setMenuOpen(false); logout(); navigate('/login') }

  const css = `
    .tn-nav-link { position: relative; }
    .tn-nav-link::after {
      content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
      background: var(--seal-primary); transform: scaleX(0); transition: transform 0.2s ease;
    }
    .tn-nav-link:hover::after,
    .tn-nav-link.tn-active::after { transform: scaleX(1); }
  `

  return (
    <>
      <style>{css}</style>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(248,252,255,0.88)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--seal-border)',
      }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div onClick={() => navigate('/teacher')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}>
            <img src="/seal-logo-transparent.png" alt="EduRAG" className="seal-brand-mark" />
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--seal-ink)' }}>EduRAG</span>
            <span style={badgeStyle}>教师端</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {navItems.map((item) => (
              <button key={item.path} className={`tn-nav-link${isActive(item.path) ? ' tn-active' : ''}`} onClick={() => navigate(item.path)}
                style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, color: isActive(item.path) ? 'var(--seal-primary)' : 'var(--seal-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {item.label}
              </button>
            ))}
          </div>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <div onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--seal-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--seal-ice)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <Avatar />
              <span style={{ fontWeight: 600, color: 'var(--seal-ink)' }}>{user?.real_name || user?.username}</span>
              <Chevron />
            </div>

            {menuOpen && (
              <div style={dropdownStyle}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--seal-border)' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--seal-ink)', margin: 0 }}>{user?.real_name || user?.username}</p>
                  <p style={{ fontSize: 12, color: 'var(--seal-muted)', margin: '2px 0 0 0' }}>{user?.username}</p>
                </div>
                <button onClick={() => { setMenuOpen(false); navigate('/change-password') }} style={menuBtnStyle}>修改密码</button>
                <button onClick={handleLogout} style={{ ...menuBtnStyle, color: '#dc2626', borderTop: '1px solid var(--seal-border)' }}>退出登录</button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <Outlet />
    </>
  )
}

function Avatar() {
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--seal-ice)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
        <circle cx={10} cy={7} r={3.5} stroke="var(--seal-primary)" strokeWidth={1.5} />
        <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="var(--seal-primary)" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    </div>
  )
}

function Chevron() {
  return <svg width={12} height={12} viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="var(--seal-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

const badgeStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--seal-primary)',
  background: 'var(--seal-ice)',
  padding: '2px 8px',
  borderRadius: 4,
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 8,
  background: '#fff',
  borderRadius: 10,
  border: '1px solid var(--seal-border)',
  boxShadow: 'var(--seal-shadow)',
  minWidth: 168,
  overflow: 'hidden',
  zIndex: 100,
}

const menuBtnStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 14,
  color: 'var(--seal-ink)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
}
