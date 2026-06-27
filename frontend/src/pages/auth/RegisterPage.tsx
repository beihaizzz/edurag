import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

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

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path d="M10 5C5.6 5 2 7.3.4 10c-.3.5-.3 1.1 0 1.5C2 14.2 5.6 16.5 10 16.5s8-2.3 9.6-5c.3-.5.3-1.1 0-1.5C18 7.3 14.4 5 10 5z" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={10} cy={10.8} r={2.5} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  ) : (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path d="M2.5 2.5L17.5 17.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
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

function SuccessIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Field = 'username' | 'password' | 'confirmPw'

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    overflow: 'hidden',
    position: 'relative',
    background: 'radial-gradient(ellipse at 50% 30%, #0f2847 0%, #091625 42%, #040b14 100%)',
    color: '#e8f5fb',
  },
  layout: {
    position: 'relative',
    zIndex: 15,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    padding: '32px',
  },
  sealPanel: {
    width: 420,
    height: 500,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: 800,
  },
  sealWrapper: {
    position: 'relative',
    width: 300,
    height: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.18s ease-out',
    filter: 'drop-shadow(0 0 32px rgba(111,182,220,0.18))',
  },
  sealImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: 'scaleX(-1)',
    userSelect: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: '42px 34px 34px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.075)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
    backdropFilter: 'blur(24px)',
  },
  logo: {
    width: 62,
    height: 62,
    objectFit: 'cover',
    borderRadius: 16,
    boxShadow: '0 18px 36px rgba(47,128,183,0.28)',
    border: '1px solid rgba(255,255,255,0.16)',
  },
  inputWrap: {
    position: 'relative',
    borderRadius: 8,
    border: '1px solid rgba(207,231,244,0.28)',
    background: 'rgba(255,255,255,0.055)',
    transition: 'all 0.2s',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'rgba(168,214,238,0.58)',
    display: 'flex',
  },
  input: {
    width: '100%',
    padding: '13px 46px 13px 44px',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#f8fcff',
    fontSize: 14,
    boxSizing: 'border-box',
  },
  toggle: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: 'rgba(168,214,238,0.58)',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  submit: {
    width: '100%',
    padding: '13px 18px',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    background: 'linear-gradient(135deg, #2f80b7, #56a9d3)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 14px 26px rgba(47,128,183,0.28)',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
}

const css = `
  body { overflow: hidden; }
  .login-star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
    animation: loginTwinkle var(--dur) ease-in-out infinite;
    animation-delay: var(--delay);
  }
  @keyframes loginTwinkle { 0%,100% { opacity: .14; } 50% { opacity: .85; } }
  @keyframes loginFlyby { from { transform: translateX(-240px); } to { transform: translateX(calc(100vw + 240px)); } }
  @keyframes loginSpeed { from { left: 120%; opacity: .28; } to { left: -30%; opacity: 0; } }
  @keyframes loginSpin { to { transform: rotate(360deg); } }
  @keyframes loginShake {
    0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)}
    40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)}
  }
  @keyframes loginFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .login-field { animation: loginFadeUp .42s ease-out both; }
  .login-field:nth-child(1) { animation-delay: .04s; }
  .login-field:nth-child(2) { animation-delay: .1s; }
  .login-field:nth-child(3) { animation-delay: .16s; }
  .login-field:nth-child(4) { animation-delay: .22s; }
  .login-field:nth-child(5) { animation-delay: .28s; }
  .login-shake { animation: loginShake .4s ease-out; }
  .login-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,.35);
    border-top-color: white;
    border-radius: 50%;
    animation: loginSpin .7s linear infinite;
  }
  .login-ship {
    position: fixed;
    top: 22%;
    left: 0;
    width: 112px;
    height: 18px;
    z-index: 5;
    pointer-events: none;
    animation: loginFlyby 7s linear infinite;
  }
  .login-ship::before {
    content: "";
    position: absolute;
    inset: 3px 0 3px 28px;
    background: #6fb6dc;
    clip-path: polygon(0 50%, 82% 0, 100% 50%, 82% 100%);
    filter: drop-shadow(0 0 8px rgba(111,182,220,.5));
  }
  .login-ship::after {
    content: "";
    position: absolute;
    top: 7px;
    left: 0;
    width: 42px;
    height: 3px;
    border-radius: 99px;
    background: rgba(111,182,220,.72);
    box-shadow: -26px 0 0 rgba(111,182,220,.34), -52px 0 0 rgba(111,182,220,.16);
  }
  .login-speed span {
    position: fixed;
    height: 1px;
    width: 13vw;
    background: #6fb6dc;
    opacity: .22;
    animation: loginSpeed var(--speed) linear infinite;
    animation-delay: var(--delay);
    pointer-events: none;
  }
  .login-pupil {
    position: absolute;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #123a5a;
    z-index: 2;
    transition: transform .08s ease-out;
  }
  .login-pupil.left { left: 62%; top: 25%; }
  .login-pupil.right { left: 76%; top: 24%; }
  .login-input-wrap:focus-within {
    border-color: rgba(111,182,220,.85) !important;
    box-shadow: 0 0 0 3px rgba(111,182,220,.18);
  }
  .login-input::placeholder { color: rgba(232,245,251,.34); }
  @media (max-width: 860px) {
    .login-seal-panel { display: none !important; }
    .login-layout { padding: 18px !important; }
  }
`

export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const passwordRef = useRef<HTMLInputElement>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [mouse, setMouse] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const [errors, setErrors] = useState<{ username?: string; password?: string; confirmPw?: string }>({})
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)
  const [shakeField, setShakeField] = useState<Field | 'form' | null>(null)
  const [loading, setLoading] = useState(false)

  const stars = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
    id: i,
    size: Math.random() * 2.4 + 0.6,
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: Math.random() * 3 + 2,
    delay: Math.random() * 5,
  })), [])

  const speedLines = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i,
    top: 16 + i * 8,
    speed: 0.55 + (i % 4) * 0.12,
    delay: -i * 0.55,
  })), [])

  const showFieldError = (field: Field, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
    setShakeField(field)
    setTimeout(() => setShakeField(null), 400)
  }

  const clearFieldError = (field: Field) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    let valid = true
    if (!username.trim()) {
      showFieldError('username', '请输入学号')
      valid = false
    } else if (username.trim().length < 4) {
      showFieldError('username', '学号至少 4 位')
      valid = false
    }
    if (!password) {
      showFieldError('password', '请输入密码')
      valid = false
    } else if (password.length < 6) {
      showFieldError('password', '密码至少 6 位')
      valid = false
    }
    if (!confirmPw) {
      showFieldError('confirmPw', '请再次输入密码')
      valid = false
    } else if (confirmPw !== password) {
      showFieldError('confirmPw', '两次密码不一致')
      valid = false
    }
    return valid
  }

  const handleBlur = (field: Field) => () => {
    if (field === 'username') {
      const v = username.trim()
      if (!v) showFieldError('username', '请输入学号')
      else if (v.length < 4) showFieldError('username', '学号至少 4 位')
    } else if (field === 'password') {
      if (!password) showFieldError('password', '请输入密码')
      else if (password.length < 6) showFieldError('password', '密码至少 6 位')
    } else if (field === 'confirmPw') {
      if (!confirmPw) showFieldError('confirmPw', '请再次输入密码')
      else if (confirmPw !== password) showFieldError('confirmPw', '两次密码不一致')
    }
  }

  const handleChange = (field: Field, value: string) => {
    if (field === 'username') { setUsername(value); if (value.trim().length >= 4) clearFieldError('username') }
    if (field === 'password') { setPassword(value); if (value.length >= 6) clearFieldError('password') }
    if (field === 'confirmPw') { setConfirmPw(value); if (value === password) clearFieldError('confirmPw') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess(false)
    if (!validate()) return

    setLoading(true)
    try {
      await register(username.trim(), password)
      setFormSuccess(true)
      await new Promise((r) => setTimeout(r, 1500))
      navigate('/login')
    } catch (err: unknown) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : '注册失败，请稍后重试'
      setFormError(msg)
      setShakeField('form')
      setTimeout(() => setShakeField(null), 400)
    }
  }

  const getSealTransform = () => {
    const normX = Math.max(-1, Math.min(1, (mouse.x - window.innerWidth * 0.34) / 360))
    const normY = Math.max(-1, Math.min(1, (mouse.y - window.innerHeight * 0.5) / 320))
    const peek = passwordFocused ? 1 : 0
    return `perspective(800px) rotateY(${normX * 8 - peek * 6}deg) rotateX(${-normY * 4}deg) translate(${normX * 10 + peek * 34}px, ${normY * 5}px) scale(${1 + peek * 0.08})`
  }

  const getPupilTransform = () => {
    const offsetX = Math.max(-6, Math.min(6, (mouse.x - window.innerWidth * 0.34) / 75))
    const offsetY = Math.max(-6, Math.min(6, (mouse.y - window.innerHeight * 0.46) / 75))
    return `translate(${offsetX}px, ${offsetY}px) scale(${passwordFocused ? 1.28 : 1})`
  }

  const inputWrapperStyle = (field: Field): CSSProperties => ({
    ...styles.inputWrap,
    borderColor: errors[field] ? 'rgba(248,113,113,.82)' : 'rgba(207,231,244,0.28)',
    background: errors[field] ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,0.055)',
  })

  return (
    <>
      <style>{css}</style>
      <main style={styles.page} onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
        <div aria-hidden="true">
          {stars.map((star) => (
            <span
              key={star.id}
              className="login-star"
              style={{
                width: star.size,
                height: star.size,
                top: `${star.top}%`,
                left: `${star.left}%`,
                '--dur': `${star.dur}s`,
                '--delay': `${star.delay}s`,
              } as CSSProperties}
            />
          ))}
          <div className="login-ship" />
          <div className="login-speed">
            {speedLines.map((line) => (
              <span
                key={line.id}
                style={{
                  top: `${line.top}%`,
                  '--speed': `${line.speed}s`,
                  '--delay': `${line.delay}s`,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>

        <div className="login-layout" style={styles.layout}>
          <section className="login-seal-panel" style={styles.sealPanel} aria-hidden="true">
            <div style={{ ...styles.sealWrapper, transform: getSealTransform() }}>
              <img src="/seal-no-eyes.png" alt="" draggable={false} style={styles.sealImg} />
              <span className="login-pupil left" style={{ transform: getPupilTransform() }} />
              <span className="login-pupil right" style={{ transform: getPupilTransform() }} />
            </div>
          </section>

          <section style={styles.card}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <img src="/seal-logo-transparent.png" alt="EduRAG" style={styles.logo} />
                <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '0.03em' }}>EduRAG</span>
              </div>
              <h1 style={{ color: '#fff', fontSize: 26, lineHeight: 1.2, margin: '0 0 8px', fontWeight: 800 }}>创建账号</h1>
              <p style={{ color: 'rgba(232,245,251,.62)', fontSize: 14, margin: 0 }}>使用学号和密码注册账号</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {formError && (
                <div className={`login-field${shakeField === 'form' ? ' login-shake' : ''}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 8,
                  color: '#fecaca',
                  background: 'rgba(239,68,68,.12)',
                  border: '1px solid rgba(239,68,68,.28)',
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  <ErrorIcon />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="login-field" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 8,
                  color: '#a7f3d0',
                  background: 'rgba(16,185,129,.12)',
                  border: '1px solid rgba(16,185,129,.32)',
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  <SuccessIcon />
                  <span>注册成功！即将跳转到登录页...</span>
                </div>
              )}

              <div className="login-field" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                  学号 / 工号 <span style={{ color: '#fca5a5' }}>*</span>
                </label>
                <div className={`login-input-wrap${shakeField === 'username' ? ' login-shake' : ''}`} style={inputWrapperStyle('username')}>
                  <span style={styles.inputIcon}><UserIcon /></span>
                  <input
                    className="login-input"
                    style={styles.input}
                    type="text"
                    autoComplete="username"
                    placeholder="请输入学号或工号"
                    value={username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    onBlur={handleBlur('username')}
                  />
                </div>
                {errors.username && <p style={{ margin: '5px 0 0 4px', color: '#fca5a5', fontSize: 12 }}>{errors.username}</p>}
              </div>

              <div className="login-field" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                  密码 <span style={{ color: '#fca5a5' }}>*</span>
                </label>
                <div className={`login-input-wrap${shakeField === 'password' ? ' login-shake' : ''}`} style={inputWrapperStyle('password')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input
                    ref={passwordRef}
                    className="login-input"
                    style={styles.input}
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="至少 6 位，包含字母和数字"
                    value={password}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => {
                      setPasswordFocused(false)
                      handleBlur('password')()
                    }}
                    onChange={(e) => handleChange('password', e.target.value)}
                  />
                  <button type="button" style={styles.toggle} onClick={() => setShowPw(!showPw)} aria-label={showPw ? '隐藏密码' : '显示密码'}>
                    <EyeIcon open={showPw} />
                  </button>
                </div>
                {errors.password && <p style={{ margin: '5px 0 0 4px', color: '#fca5a5', fontSize: 12 }}>{errors.password}</p>}
              </div>

              <div className="login-field" style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                  确认密码 <span style={{ color: '#fca5a5' }}>*</span>
                </label>
                <div className={`login-input-wrap${shakeField === 'confirmPw' ? ' login-shake' : ''}`} style={inputWrapperStyle('confirmPw')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input
                    className="login-input"
                    style={styles.input}
                    type={showConfirmPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="请再次输入密码"
                    value={confirmPw}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => {
                      setPasswordFocused(false)
                      handleBlur('confirmPw')()
                    }}
                    onChange={(e) => handleChange('confirmPw', e.target.value)}
                  />
                  <button type="button" style={styles.toggle} onClick={() => setShowConfirmPw(!showConfirmPw)} aria-label={showConfirmPw ? '隐藏密码' : '显示密码'}>
                    <EyeIcon open={showConfirmPw} />
                  </button>
                </div>
                {errors.confirmPw && <p style={{ margin: '5px 0 0 4px', color: '#fca5a5', fontSize: 12 }}>{errors.confirmPw}</p>}
              </div>

              <div className="login-field">
                <button
                  type="submit"
                  disabled={loading || formSuccess}
                  style={{
                    ...styles.submit,
                    opacity: loading ? 0.72 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: formSuccess ? '#10b981' : styles.submit.background,
                  }}
                >
                  {loading ? <><span className="login-spinner" />注册中...</> : formSuccess ? '注册成功' : '注 册'}
                </button>
              </div>
            </form>

            <p className="login-field" style={{ margin: '24px 0 0', textAlign: 'center', color: 'rgba(232,245,251,.46)', fontSize: 14 }}>
              已有账号？
              <Link to="/login" style={{ color: '#a8d6ee', fontWeight: 700, textDecoration: 'none', marginLeft: 4 }}>立即登录</Link>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
