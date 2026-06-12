import { useState, useRef, type CSSProperties } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

/* ═══════════════════════════════════════════════════════════════════════
   Inline SVG Icons
   ═══════════════════════════════════════════════════════════════════════ */

function UserIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <circle cx={10} cy={7} r={3.5} stroke="currentColor" strokeWidth={1.5} />
      <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <rect x={5} y={9} width={10} height={8} rx={1.5} stroke="currentColor" strokeWidth={1.5} />
      <path d="M7 9V6a3 3 0 013-3v0a3 3 0 013 3v3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path d="M2.5 2.5L17.5 17.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M10 5C5.6 5 2 7.3.4 10c-.3.5-.3 1.1 0 1.5C2 14.2 5.6 16.5 10 16.5s8-2.3 9.6-5c.3-.5.3-1.1 0-1.5C18 7.3 14.4 5 10 5z" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={10} cy={10.8} r={2.5} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

function EyeOnIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path d="M10 5C5.6 5 2 7.3.4 10c-.3.5-.3 1.1 0 1.5C2 14.2 5.6 16.5 10 16.5s8-2.3 9.6-5c.3-.5.3-1.1 0-1.5C18 7.3 14.4 5 10 5z" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={10} cy={10.8} r={2.5} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} />
      <path d="M8 5v3.5M8 11h0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════════ */

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    fontFamily: "'Inter', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  } as CSSProperties,

  /* ── Left Brand Panel ── */
  brandPanel: {
    position: 'relative',
    overflow: 'hidden',
  } as CSSProperties,

  brandOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to bottom right, rgba(49,46,129,0.6), rgba(49,46,129,0.25), rgba(55,48,163,0.5))',
  } as CSSProperties,

  brandContent: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    textAlign: 'center',
    color: '#fff',
    padding: '48px',
  } as CSSProperties,

  logo: {
    width: 56,
    height: 48,
    filter: 'drop-shadow(0 0 12px rgba(134,59,255,0.5))',
  } as CSSProperties,

  brandName: {
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: '0.05em',
    textShadow: '0 0 40px rgba(134,59,255,0.5)',
    marginTop: 12,
  } as CSSProperties,

  slogan: {
    fontSize: 28,
    fontWeight: 600,
    lineHeight: 1.5,
    maxWidth: 320,
    marginTop: 40,
  } as CSSProperties,

  brandDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.05em',
    maxWidth: 320,
    marginTop: 16,
  } as CSSProperties,

  /* ── Right Form Panel ── */
  formPanel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#f8fafc',
  } as CSSProperties,

  formCard: {
    width: '100%',
    maxWidth: 420,
  } as CSSProperties,

  mobileLogo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    textAlign: 'center',
  } as CSSProperties,

  mobileLogoImg: {
    width: 48,
    height: 40,
  } as CSSProperties,

  mobileLogoText: {
    fontSize: 24,
    fontWeight: 800,
    color: '#0f172a',
  } as CSSProperties,

  mobileLogoDesc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  } as CSSProperties,

  welcomeTitle: {
    fontSize: 36,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 8,
  } as CSSProperties,

  welcomeSub: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 32,
  } as CSSProperties,

  field: {
    marginBottom: 20,
  } as CSSProperties,

  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#334155',
    marginBottom: 6,
  } as CSSProperties,

  inputWrapper: {
    position: 'relative',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#fff',
    transition: 'all 0.2s',
  } as CSSProperties,

  inputIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 14,
    color: '#94a3b8',
    pointerEvents: 'none',
  } as CSSProperties,

  input: {
    width: '100%',
    padding: '12px 48px 12px 42px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: 14,
    color: '#0f172a',
    borderRadius: 8,
    boxSizing: 'border-box',
  } as CSSProperties,

  toggleBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    paddingRight: 14,
    color: '#94a3b8',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  } as CSSProperties,

  fieldError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
    marginLeft: 4,
  } as CSSProperties,

  submitBtn: {
    width: '100%',
    padding: '12px 16px',
    background: '#6366F1',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.2s',
    position: 'relative',
    overflow: 'hidden',
  } as CSSProperties,

  formError: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 20,
  } as CSSProperties,

  registerLink: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    color: '#64748b',
  } as CSSProperties,
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [shakeField, setShakeField] = useState<'username' | 'password' | 'form' | null>(null)
  const [success, setSuccess] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  /* ── Validation ── */
  function clearError(field: 'username' | 'password') {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function showError(field: 'username' | 'password', msg: string) {
    setErrors((prev) => ({ ...prev, [field]: msg }))
    setShakeField(field)
    setTimeout(() => setShakeField(null), 400)
  }

  function validate(): boolean {
    let valid = true
    if (!username.trim()) {
      showError('username', '请输入学号或工号')
      valid = false
    }
    if (!password) {
      showError('password', '请输入密码')
      valid = false
    }
    return valid
  }

  const handleBlur = (field: 'username' | 'password') => () => {
    const val = field === 'username' ? username : password
    if (!val.trim()) {
      showError(field, field === 'username' ? '请输入学号或工号' : '请输入密码')
    }
  }

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setLoading(true)
    try {
      const user = await login(username.trim(), password)
      setSuccess(true)
      await new Promise((r) => setTimeout(r, 600))
      if (user.force_password_change) {
        navigate('/change-password')
      } else {
        navigate(`/${user.role}`)
      }
    } catch (err: unknown) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : '学号或密码错误，请重试'
      setFormError(msg)
      setShakeField('form')
      setTimeout(() => setShakeField(null), 400)
      passwordRef.current?.focus()
      passwordRef.current?.select()
    }
  }

  /* ── Dynamic input wrapper style ── */
  const getInputStyle = (field: 'username' | 'password'): CSSProperties => ({
    ...styles.inputWrapper,
    borderColor: errors[field] ? '#fca5a5' : '#e2e8f0',
    boxShadow: errors[field] ? '0 0 0 3px rgba(239,68,68,0.1)' : undefined,
    background: errors[field] ? '#fef2f2' : '#fff',
  })

  /* ── Animations (injected style tag) ── */
  const css = `
    body { margin: 0; overflow: hidden; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shake {
      0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)}
      40%{transform:translateX(4px)} 60%{transform:translateX(-3px)}
      80%{transform:translateX(3px)}
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ripple {
      to { opacity: 1; }
    }
    .form-field { animation: fadeSlideUp 0.4s ease-out both; }
    .form-field:nth-child(1) { animation-delay: 0.05s; }
    .form-field:nth-child(2) { animation-delay: 0.12s; }
    .form-field:nth-child(3) { animation-delay: 0.19s; }
    .form-field:nth-child(4) { animation-delay: 0.26s; }
    .shake { animation: shake 0.4s ease-out; }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    .brand-panel { display: none; }
    @media (min-width: 1024px) {
      .brand-panel { display: flex; width: 50%; }
      .mobile-brand { display: none; }
      .desktop-welcome { display: block; }
    }
    @media (min-width: 1280px) {
      .brand-panel { width: 60%; }
    }
    @media (max-width: 1023px) {
      .desktop-welcome { display: none; }
    }
  `

  return (
    <>
      <style>{css}</style>
      <div style={styles.container}>

        {/* ═══ Left: Brand Panel ═══ */}
        <div
          className="brand-panel"
          style={{
            ...styles.brandPanel,
            background: "url('/dljmfm.png') center/cover no-repeat",
          }}
        >
          <div style={styles.brandOverlay} />
          <div style={styles.brandContent}>
            <img src="/favicon.svg" alt="EduRAG" style={styles.logo} />
            <div style={styles.brandName}>EduRAG</div>
            <div style={styles.slogan}>
              知识不在于拥有答案，<br />而在于提出正确的问题。
            </div>
            <div style={styles.brandDesc}>校园课程资料智能搜索与问答服务</div>
          </div>
        </div>

        {/* ═══ Right: Login Form ═══ */}
        <div style={styles.formPanel}>
          <div style={styles.formCard}>

            {/* Mobile Brand */}
            <div className="mobile-brand" style={styles.mobileLogo}>
              <img src="/favicon.svg" alt="EduRAG" style={styles.mobileLogoImg} />
              <div style={styles.mobileLogoText}>EduRAG</div>
              <div style={styles.mobileLogoDesc}>校园课程资料智能搜索与问答服务系统</div>
            </div>

            {/* Welcome Title (desktop) */}
            <div className="desktop-welcome">
              <h1 style={styles.welcomeTitle}>欢迎回来</h1>
              <p style={styles.welcomeSub}>登录你的账号，继续探索知识</p>
            </div>

            {/* ═══ Form ═══ */}
            <form onSubmit={handleSubmit} noValidate>

              {/* Global Error */}
              {formError && (
                <div
                  className={`form-field${shakeField === 'form' ? ' shake' : ''}`}
                  style={styles.formError}
                >
                  <ErrorIcon />
                  <span>{formError}</span>
                </div>
              )}

              {/* Username */}
              <div className="form-field" style={styles.field}>
                <label style={styles.label}>学号 / 工号</label>
                <div className={shakeField === 'username' ? 'shake' : ''} style={getInputStyle('username')}>
                  <span style={styles.inputIcon}><UserIcon /></span>
                  <input
                    ref={usernameRef}
                    style={styles.input}
                    type="text"
                    autoComplete="username"
                    placeholder="请输入学号或工号"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); clearError('username') }}
                    onBlur={handleBlur('username')}
                  />
                </div>
                {errors.username && <p style={styles.fieldError}>{errors.username}</p>}
              </div>

              {/* Password */}
              <div className="form-field" style={styles.field}>
                <label style={styles.label}>密码</label>
                <div className={shakeField === 'password' ? 'shake' : ''} style={getInputStyle('password')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input
                    ref={passwordRef}
                    style={styles.input}
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError('password') }}
                    onBlur={handleBlur('password')}
                  />
                  <button
                    type="button"
                    style={styles.toggleBtn}
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? '隐藏密码' : '显示密码'}
                  >
                    {showPw ? <EyeOnIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {errors.password && <p style={styles.fieldError}>{errors.password}</p>}
              </div>

              {/* Submit */}
              <div className="form-field" style={{ ...styles.field, paddingTop: 4 }}>
                <button
                  type="submit"
                  disabled={loading || success}
                  style={{
                    ...styles.submitBtn,
                    ...(success ? { background: '#10b981' } : {}),
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !success) {
                      e.currentTarget.style.background = '#4F46E5'
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && !success) {
                      e.currentTarget.style.background = '#6366F1'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      <span>登录中...</span>
                    </>
                  ) : success ? (
                    '登录成功 ✓'
                  ) : (
                    '登 录'
                  )}
                </button>
              </div>
            </form>

            {/* Register link */}
            <div className="form-field" style={styles.registerLink}>
              还没有账号？
              <Link to="/register" style={{ color: '#4F46E5', fontWeight: 500, textDecoration: 'none' }}>
                立即注册
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
