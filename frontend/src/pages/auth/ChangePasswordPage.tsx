import { useState, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

/* ═══════════════════════════════════════════════════════════════════════
   Inline SVG Icons
   ═══════════════════════════════════════════════════════════════════════ */

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

function SuccessIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx={8} cy={8} r={7} stroke="currentColor" strokeWidth={1.5} />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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

  brandPanel: { position: 'relative', overflow: 'hidden' } as CSSProperties,
  brandOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(to bottom right, rgba(49,46,129,0.6), rgba(49,46,129,0.25), rgba(55,48,163,0.5))',
  } as CSSProperties,
  brandContent: {
    position: 'relative', zIndex: 10,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: '100%', textAlign: 'center', color: '#fff', padding: '48px',
  } as CSSProperties,
  logo: { width: 56, height: 48, filter: 'drop-shadow(0 0 12px rgba(134,59,255,0.5))' } as CSSProperties,
  brandName: { fontSize: 30, fontWeight: 800, letterSpacing: '0.05em', textShadow: '0 0 40px rgba(134,59,255,0.5)', marginTop: 12 } as CSSProperties,
  slogan: { fontSize: 28, fontWeight: 600, lineHeight: 1.5, maxWidth: 320, marginTop: 40 } as CSSProperties,
  brandDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', maxWidth: 320, marginTop: 16 } as CSSProperties,

  formPanel: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc' } as CSSProperties,
  formCard: { width: '100%', maxWidth: 420 } as CSSProperties,

  mobileLogo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20, textAlign: 'center' } as CSSProperties,
  mobileLogoImg: { width: 40, height: 34 } as CSSProperties,
  mobileLogoText: { fontSize: 20, fontWeight: 800, color: '#0f172a' } as CSSProperties,
  mobileLogoDesc: { fontSize: 13, color: '#64748b', marginTop: 2 } as CSSProperties,

  welcomeTitle: { fontSize: 36, fontWeight: 700, color: '#0f172a', marginBottom: 8 } as CSSProperties,
  welcomeSub: { fontSize: 15, color: '#64748b', marginBottom: 28 } as CSSProperties,

  field: { marginBottom: 16 } as CSSProperties,
  label: { display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 } as CSSProperties,
  required: { color: '#ef4444' } as CSSProperties,

  inputWrapper: { position: 'relative', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', transition: 'all 0.2s' } as CSSProperties,
  inputIcon: { position: 'absolute', top: 0, bottom: 0, left: 0, display: 'flex', alignItems: 'center', paddingLeft: 14, color: '#94a3b8', pointerEvents: 'none' } as CSSProperties,
  input: { width: '100%', padding: '12px 48px 12px 42px', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#0f172a', borderRadius: 8, boxSizing: 'border-box' } as CSSProperties,
  toggleBtn: { position: 'absolute', top: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', paddingRight: 14, color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none' } as CSSProperties,
  fieldError: { fontSize: 12, color: '#dc2626', marginTop: 4, marginLeft: 4 } as CSSProperties,

  submitBtn: {
    width: '100%', padding: '12px 16px', background: '#6366F1', color: '#fff',
    fontWeight: 600, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer',
    marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
  } as CSSProperties,

  formError: { display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16 } as CSSProperties,
  formSuccess: { display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, marginBottom: 16 } as CSSProperties,
  backLink: { textAlign: 'center', marginTop: 24, fontSize: 14, color: '#64748b' } as CSSProperties,
}

/* ═══════════════════════════════════════════════════════════════════════
   CSS injection
   ═══════════════════════════════════════════════════════════════════════ */

const injectedCSS = `
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
  .form-field { animation: fadeSlideUp 0.4s ease-out both; }
  .form-field:nth-child(1) { animation-delay: 0.03s; }
  .form-field:nth-child(2) { animation-delay: 0.08s; }
  .form-field:nth-child(3) { animation-delay: 0.13s; }
  .form-field:nth-child(4) { animation-delay: 0.18s; }
  .form-field:nth-child(5) { animation-delay: 0.23s; }
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

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, resetPassword, changePassword } = useAuthStore()
  const isForce = user?.force_password_change ?? false

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)
  const [shakeField, setShakeField] = useState<string | null>(null)

  /* ── Helpers ── */
  function clearField(f: string) { setErrors((p) => ({ ...p, [f]: undefined! })) }
  function setFieldErr(f: string, msg: string) {
    setErrors((p) => ({ ...p, [f]: msg }))
    setShakeField(f); setTimeout(() => setShakeField(null), 400)
  }

  function validate(): boolean {
    let ok = true
    if (!isForce && !oldPw) { setFieldErr('oldPw', '请输入当前密码'); ok = false }
    if (!newPw) { setFieldErr('newPw', '请输入新密码'); ok = false }
    else if (newPw.length < 6) { setFieldErr('newPw', '新密码至少 6 位'); ok = false }
    else if (!isForce && newPw === oldPw) { setFieldErr('newPw', '新密码不能与旧密码相同'); ok = false }
    if (!confirmPw) { setFieldErr('confirmPw', '请再次输入新密码'); ok = false }
    else if (confirmPw !== newPw) { setFieldErr('confirmPw', '两次密码不一致'); ok = false }
    return ok
  }

  const handleBlur = (f: string) => () => {
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

  const handleChange = (f: string, v: string) => {
    if (f === 'oldPw') { setOldPw(v); if (v) clearField('oldPw') }
    if (f === 'newPw') { setNewPw(v); if (v.length >= 6 && (!isForce || v !== oldPw)) clearField('newPw') }
    if (f === 'confirmPw') { setConfirmPw(v); if (v === newPw) clearField('confirmPw') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(''); setFormSuccess(false)
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
        setShakeField('form'); setTimeout(() => setShakeField(null), 400)
      }
    }
  }

  const getInputStyle = (f: string): CSSProperties => ({
    ...styles.inputWrapper,
    borderColor: errors[f] ? '#fca5a5' : '#e2e8f0',
    boxShadow: errors[f] ? '0 0 0 3px rgba(239,68,68,0.1)' : undefined,
    background: errors[f] ? '#fef2f2' : '#fff',
  })

  const descText = isForce ? '首次登录，请设置你的新密码' : '修改你的登录密码'
  const successText = isForce ? '密码设置成功！请重新登录...' : '密码修改成功！即将跳转...'

  return (
    <>
      <style>{injectedCSS}</style>
      <div style={styles.container}>

        {/* Left Brand Panel */}
        <div className="brand-panel" style={{ ...styles.brandPanel, background: "url('/dljmfm.png') center/cover no-repeat" }}>
          <div style={styles.brandOverlay} />
          <div style={styles.brandContent}>
            <img src="/favicon.svg" alt="EduRAG" style={styles.logo} />
            <div style={styles.brandName}>EduRAG</div>
            <div style={styles.slogan}>保护你的账户安全，<br />从这里开始。</div>
            <div style={styles.brandDesc}>{descText}</div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div style={styles.formPanel}>
          <div style={styles.formCard}>

            {/* Mobile Brand */}
            <div className="mobile-brand" style={styles.mobileLogo}>
              <img src="/favicon.svg" alt="EduRAG" style={styles.mobileLogoImg} />
              <div style={styles.mobileLogoText}>EduRAG</div>
              <div style={styles.mobileLogoDesc}>{descText}</div>
            </div>

            {/* Title */}
            <div className="desktop-welcome">
              <h1 style={styles.welcomeTitle}>{isForce ? '设置密码' : '修改密码'}</h1>
              <p style={styles.welcomeSub}>{descText}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>

              {/* Global Error */}
              {formError && (
                <div className={`form-field${shakeField === 'form' ? ' shake' : ''}`} style={styles.formError}>
                  <ErrorIcon /><span>{formError}</span>
                </div>
              )}

              {/* Global Success */}
              {formSuccess && (
                <div className="form-field" style={styles.formSuccess}>
                  <SuccessIcon /><span>{successText}</span>
                </div>
              )}

              {/* Old Password (normal mode only) */}
              {!isForce && (
                <div className="form-field" style={styles.field}>
                  <label style={styles.label}>旧密码 <span style={styles.required}>*</span></label>
                  <div className={shakeField === 'oldPw' ? 'shake' : ''} style={getInputStyle('oldPw')}>
                    <span style={styles.inputIcon}><LockIcon /></span>
                    <input style={styles.input} type={showOld ? 'text' : 'password'} autoComplete="current-password"
                      placeholder="请输入当前密码" value={oldPw}
                      onChange={(e) => handleChange('oldPw', e.target.value)} onBlur={handleBlur('oldPw')} />
                    <button type="button" style={styles.toggleBtn} onClick={() => setShowOld(!showOld)}
                      aria-label={showOld ? '隐藏密码' : '显示密码'}>
                      {showOld ? <EyeOnIcon /> : <EyeOffIcon />}
                    </button>
                  </div>
                  {errors.oldPw && <p style={styles.fieldError}>{errors.oldPw}</p>}
                </div>
              )}

              {/* New Password */}
              <div className="form-field" style={styles.field}>
                <label style={styles.label}>新密码 <span style={styles.required}>*</span></label>
                <div className={shakeField === 'newPw' ? 'shake' : ''} style={getInputStyle('newPw')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input style={styles.input} type={showNew ? 'text' : 'password'} autoComplete="new-password"
                    placeholder="至少 6 位，不能与旧密码相同" value={newPw}
                    onChange={(e) => handleChange('newPw', e.target.value)} onBlur={handleBlur('newPw')} />
                  <button type="button" style={styles.toggleBtn} onClick={() => setShowNew(!showNew)}
                    aria-label={showNew ? '隐藏密码' : '显示密码'}>
                    {showNew ? <EyeOnIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {errors.newPw && <p style={styles.fieldError}>{errors.newPw}</p>}
              </div>

              {/* Confirm Password */}
              <div className="form-field" style={styles.field}>
                <label style={styles.label}>确认新密码 <span style={styles.required}>*</span></label>
                <div className={shakeField === 'confirmPw' ? 'shake' : ''} style={getInputStyle('confirmPw')}>
                  <span style={styles.inputIcon}><LockIcon /></span>
                  <input style={styles.input} type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                    placeholder="请再次输入新密码" value={confirmPw}
                    onChange={(e) => handleChange('confirmPw', e.target.value)} onBlur={handleBlur('confirmPw')} />
                  <button type="button" style={styles.toggleBtn} onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? '隐藏密码' : '显示密码'}>
                    {showConfirm ? <EyeOnIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {errors.confirmPw && <p style={styles.fieldError}>{errors.confirmPw}</p>}
              </div>

              {/* Submit */}
              <div className="form-field" style={{ ...styles.field, paddingTop: 8 }}>
                <button type="submit" disabled={loading || formSuccess}
                  style={{
                    ...styles.submitBtn,
                    ...(formSuccess ? { background: '#10b981' } : {}),
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !formSuccess) {
                      e.currentTarget.style.background = '#4F46E5'
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.35)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && !formSuccess) {
                      e.currentTarget.style.background = '#6366F1'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {loading ? <><span className="spinner" /><span>修改中...</span></>
                    : formSuccess ? '修改成功 ✓'
                    : '确认修改'}
                </button>
              </div>
            </form>

            <div className="form-field" style={{ ...styles.backLink, animationDelay: '0.28s' }}>
              <a onClick={() => navigate('/login')}
                style={{ color: '#4F46E5', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
                返回登录
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
