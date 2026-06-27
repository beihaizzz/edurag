import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

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

type Field = 'oldPw' | 'newPw' | 'confirmPw'

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

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, resetPassword, changePassword } = useAuthStore()
  const isForce = user?.force_password_change ?? false

  const newPwRef = useRef<HTMLInputElement>(null)

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [mouse, setMouse] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)
  const [shakeField, setShakeField] = useState<Field | 'form' | null>(null)

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

  const clearField = (f: Field) => setErrors((p) => ({ ...p, [f]: undefined }))
  const setFieldErr = (f: Field, msg: string) => {
    setErrors((p) => ({ ...p, [f]: msg }))
    setShakeField(f)
    setTimeout(() => setShakeField(null), 400)
  }

  const validate = (): boolean => {
    let ok = true
    if (!isForce && !oldPw) { setFieldErr('oldPw', '请输入当前密码'); ok = false }
    if (!newPw) { setFieldErr('newPw', '请输入新密码'); ok = false }
    else if (newPw.length < 6) { setFieldErr('newPw', '新密码至少 6 位'); ok = false }
    else if (!isForce && newPw === oldPw) { setFieldErr('newPw', '新密码不能与旧密码相同'); ok = false }
    if (!confirmPw) { setFieldErr('confirmPw', '请再次输入新密码'); ok = false }
    else if (confirmPw !== newPw) { setFieldErr('confirmPw', '两次密码不一致'); ok = false }
    return ok
  }

  const handleBlur = (f: Field) => () => {
    if (f === 'oldPw' && !oldPw) setFieldErr('oldPw', '请输入当前密码')
    if (f === 'newPw') {
      if (!newPw) setFieldErr('newPw', '请输入新密码')
      else if (newPw.length < 6) setFieldErr('newPw', '新密码至少 6 位')
      else if (!isForce && newPw === oldPw) setFieldErr('newPw', '新密码不能与旧密码相同')
    }
    if (f === 'confirmPw') {
      if (!confirmPw) setFieldErr('confirmPw', '请再次输入新密码')
      else if (confirmPw !== newPw) setFieldErr('confirmPw', '两次密码不一致')
    }
  }

  const handleChange = (f: Field, v: string) => {
    if (f === 'oldPw') { setOldPw(v); if (v) clearField('oldPw') }
    if (f === 'newPw') { setNewPw(v); if (v.length >= 6 && (!isForce ? v !== oldPw : true)) clearField('newPw') }
    if (f === 'confirmPw') { setConfirmPw(v); if (v === newPw) clearField('confirmPw') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess(false)
    if (!validate()) return

    setLoading(true)
    try {
      if (isForce) {
        await resetPassword(newPw)
      } else {
        await changePassword(oldPw, newPw)
      }
      setFormSuccess(true)
      await new Promise((r) => setTimeout(r, 1500))
      navigate(isForce ? '/login' : `/${user?.role}`)
    } catch (err: unknown) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : '修改失败，请稍后重试'
      if (msg.includes('旧密码')) {
        setFieldErr('oldPw', '旧密码不正确')
      } else {
        setFormError(msg)
        setShakeField('form')
        setTimeout(() => setShakeField(null), 400)
      }
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

  const title = isForce ? '设置密码' : '修改密码'
  const subtitle = isForce ? '首次登录，请设置你的新密码' : '修改你的登录密码'
  const successText = isForce ? '密码设置成功！请重新登录...' : '密码修改成功！即将跳转...'
  const submitText = isForce ? '设置密码' : '确认修改'
  const loadingText = isForce ? '设置中...' : '修改中...'

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
              <h1 style={{ color: '#fff', fontSize: 26, lineHeight: 1.2, margin: '0 0 8px', fontWeight: 800 }}>{title}</h1>
              <p style={{ color: 'rgba(232,245,251,.62)', fontSize: 14, margin: 0 }}>{subtitle}</p>
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
                  <span>{successText}</span>
                </div>
              )}

              {!isForce && (
                <div className="login-field" style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                    旧密码 <span style={{ color: '#fca5a5' }}>*</span>
                  </label>
                  <div className={`login-input-wrap${shakeField === 'oldPw' ? ' login-shake' : ''}`} style={inputWrapperStyle('oldPw')}>
                    <span style={styles.inputIcon}><LockIcon /></span>
                    <input
                      className="login-input"
                      style={styles.input}
                      type={showOld ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="请输入当前密码"
                      value={oldPw}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => { setPasswordFocused(false); handleBlur('oldPw')() }}
                      onChange={(e) => handleChange('oldPw', e.target.value)}
                    />
                    <button type="button" style={styles.toggle} onClick={() => setShowOld(!showOld)} aria-label={showOld ? '隐藏密码' : '显示密码'}>
                      <EyeIcon open={showOld} />
                    </button>
                  </div>
                  {errors.oldPw && <p style={{ margin: '5px 0 0 4px', color: '#fca5a5', fontSize: 12 }}>{errors.oldPw}</p>}
                </div>
              )}

              <div className="login-field" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                  新密码 <span style={{ color: '#fca5a5' }}>*</span>
                </label>
                <div className={`login-input-wrap${shakeField === 'newPw' ? ' login-shake' : ''}`} style={inputWrapperStyle('newPw')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input
                    ref={newPwRef}
                    className="login-input"
                    style={styles.input}
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={isForce ? '至少 6 位' : '至少 6 位，不能与旧密码相同'}
                    value={newPw}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => { setPasswordFocused(false); handleBlur('newPw')() }}
                    onChange={(e) => handleChange('newPw', e.target.value)}
                  />
                  <button type="button" style={styles.toggle} onClick={() => setShowNew(!showNew)} aria-label={showNew ? '隐藏密码' : '显示密码'}>
                    <EyeIcon open={showNew} />
                  </button>
                </div>
                {errors.newPw && <p style={{ margin: '5px 0 0 4px', color: '#fca5a5', fontSize: 12 }}>{errors.newPw}</p>}
              </div>

              <div className="login-field" style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: 'rgba(232,245,251,.76)', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                  确认新密码 <span style={{ color: '#fca5a5' }}>*</span>
                </label>
                <div className={`login-input-wrap${shakeField === 'confirmPw' ? ' login-shake' : ''}`} style={inputWrapperStyle('confirmPw')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input
                    className="login-input"
                    style={styles.input}
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="请再次输入新密码"
                    value={confirmPw}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => { setPasswordFocused(false); handleBlur('confirmPw')() }}
                    onChange={(e) => handleChange('confirmPw', e.target.value)}
                  />
                  <button type="button" style={styles.toggle} onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? '隐藏密码' : '显示密码'}>
                    <EyeIcon open={showConfirm} />
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
                  {loading ? <><span className="login-spinner" />{loadingText}</> : formSuccess ? '修改成功' : submitText}
                </button>
              </div>
            </form>

            <p className="login-field" style={{ margin: '24px 0 0', textAlign: 'center', color: 'rgba(232,245,251,.46)', fontSize: 14 }}>
              <a
                onClick={() => navigate('/login')}
                style={{ color: '#a8d6ee', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}
              >
                返回登录
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
