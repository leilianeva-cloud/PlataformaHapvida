import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : err.message === 'Email not confirmed'
          ? 'Confirme seu e-mail antes de entrar.'
          : 'Erro ao entrar. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        :root {
          --primary: #002E6E;
          --primary-light: #0A438F;
          --accent-red: #E31C24;
          --accent-orange: #F37021;
          --accent-yellow: #FFC20E;
          --bg-light: #F8FAFC;
          --text-dark: #0F172A;
          --text-muted: #64748B;
          --border-color: #CBD5E1;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; }
        .hap-input {
          width: 100%;
          height: 56px;
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          padding: 0 18px;
          font-size: 16px;
          font-family: 'Inter', sans-serif;
          color: var(--text-dark);
          background: #fff;
          transition: all 0.2s;
          outline: none;
        }
        .hap-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(0,46,110,0.1);
        }
        .hap-btn {
          width: 100%;
          height: 56px;
          background: var(--primary);
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 17px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          box-shadow: 0 10px 25px -5px rgba(0,46,110,0.3);
          transition: background 0.2s, transform 0.1s;
        }
        .hap-btn:hover:not(:disabled) { background: var(--primary-light); }
        .hap-btn:active:not(:disabled) { transform: scale(0.99); }
        .hap-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }
        .brand-glow {
          position: absolute;
          width: 500px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(243,112,33,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .brand-line {
          height: 5px;
          width: 140px;
          background: linear-gradient(90deg, #E31C24 0%, #F37021 50%, #FFC20E 100%);
          border-radius: 3px;
          margin: 20px 0;
        }
      `}</style>

      <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'Inter', sans-serif" }}>

        {/* ── Lado esquerdo (azul) ── */}
        <div style={{ flex:'0 0 50%', background:'var(--primary)', position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="grid-overlay" />
          <div className="brand-glow" style={{ left:100, top:180 }} />
          <div className="brand-glow" style={{ right:-50, bottom:100, width:300, height:300 }} />

          <div style={{ position:'relative', zIndex:10, padding:'48px 64px', color:'#fff', maxWidth:560 }}>
            {/* Ícone / símbolo */}
            <div style={{ width:72, height:72, borderRadius:20, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:36, fontSize:36 }}>
              🏥
            </div>

            <h1 style={{ fontSize:52, fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.1, marginBottom:8 }}>
              Plataforma<br/>Hapvida
            </h1>

            <div className="brand-line" />

            <p style={{ fontSize:20, fontWeight:300, lineHeight:1.6, color:'rgba(255,255,255,0.85)', marginBottom:20 }}>
              Governança inteligente, acompanhamento ágil de marcos estratégicos e integridade nos cronogramas da operação.
            </p>

            <p style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.45)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
              Exclusivo para Colaboradores Hapvida
            </p>

            {/* Cards de destaque */}
            <div style={{ marginTop:48, display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { icon:'📊', text:'Status Report automatizado' },
                { icon:'📅', text:'Cronogramas e marcos em tempo real' },
                { icon:'📑', text:'Geração de PPTX com 1 clique' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.07)', borderRadius:10, padding:'12px 16px', border:'1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <span style={{ fontSize:15, color:'rgba(255,255,255,0.85)', fontWeight:500 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Lado direito (formulário) ── */}
        <div style={{ flex:'0 0 50%', background:'var(--bg-light)', display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
          <div style={{ width:'100%', maxWidth:440, display:'flex', flexDirection:'column', gap:0 }}>

            {/* Cabeçalho */}
            <div style={{ marginBottom:40 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
                <div style={{ width:8, height:40, background:'linear-gradient(180deg, #E31C24, #F37021)', borderRadius:4 }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Status Semanal</div>
                  <div style={{ fontSize:13, color:'var(--text-muted)' }}>Marcos e Cronogramas</div>
                </div>
              </div>
              <h2 style={{ fontSize:32, fontWeight:700, color:'var(--text-dark)', letterSpacing:'-0.01em', marginBottom:8 }}>
                Acesse sua conta
              </h2>
              <p style={{ fontSize:16, color:'var(--text-muted)' }}>
                Insira suas credenciais corporativas.
              </p>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div>
                <label style={{ display:'block', fontSize:13, fontWeight:600, color:'var(--text-dark)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                  E-mail corporativo
                </label>
                <input className="hap-input" type="email" placeholder="exemplo@hapvida.com.br"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>

              <div>
                <label style={{ display:'block', fontSize:13, fontWeight:600, color:'var(--text-dark)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                  Senha
                </label>
                <input className="hap-input" type="password" placeholder="••••••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:14, fontWeight:500 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-dark)', cursor:'pointer' }}>
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                    style={{ width:16, height:16, accentColor:'var(--primary)' }} />
                  Manter conectado
                </label>
              </div>

              {error && (
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#DC2626', borderRadius:8, padding:'12px 14px', fontSize:14 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="hap-btn">
                {loading ? 'Entrando…' : 'Entrar na Plataforma'}
              </button>
            </form>

            {/* Rodapé */}
            <div style={{ marginTop:32, borderTop:'1px solid #E2E8F0', paddingTop:24 }}>
              <p style={{ fontSize:13, lineHeight:1.6, color:'var(--text-muted)', marginBottom:6 }}>
                ⚠️ <strong>Acesso Restrito:</strong> Este sistema contém informações proprietárias e confidenciais da Hapvida. O uso não autorizado será monitorado.
              </p>
              <p style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:'0.05em', textTransform:'uppercase', fontWeight:500 }}>
                🔒 Conexão Segura SSL · Em conformidade com a LGPD
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  )
}
