import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; font-family:'Inter',sans-serif; }
        .hap-body {
          min-height: 100vh;
          background: linear-gradient(135deg, #001F4E 0%, #003B85 55%, #0057B8 100%);
          color: white;
          position: relative;
          overflow: hidden;
        }
        

  .hm-watermark {
  position: fixed;
  left: -160px;
  bottom: -220px;
  width: 600px;       /* ajuste o tamanho conforme a imagem */
  opacity: .045;
  z-index: 0;
  pointer-events: none;
  user-select: none;
  filter: grayscale(100%) brightness(10);
  }


        .hap-logo {
          position: absolute;
          top: 45px;
          left: 60px;
        }
        .hap-logo img {
          height: 48px;
          width: auto;
        }
        .hap-logo-text {
          font-size: 22px;
          font-weight: 800;
          color: white;
          letter-spacing: -0.5px;
        }
        .hap-logo-text span { color: #FF7900; }
        .hap-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 80px;
          max-width: 1500px;
          margin: 0 auto;
        }
        .hap-info { width: 50%; }
        .hap-title { font-size: 40px; font-weight: 800; margin-bottom: 18px; }
        .hap-title span { color: #FF7900; }
        .hap-subtitle { font-size: 22px; font-weight: 600; margin-bottom: 55px; }
        .hap-line { width: 75px; height: 4px; background: #FF7900; margin-bottom: 35px; border-radius: 2px; }
        .hap-description { max-width: 520px; font-size: 18px; line-height: 1.7; margin-bottom: 70px; opacity: .9; }
        .hap-features { display: flex; gap: 50px; }
        .hap-feature { width: 150px; }
        .hap-icon { color: #FF7900; font-size: 30px; margin-bottom: 16px; }
        .hap-feature strong { display: block; margin-bottom: 10px; font-size: 15px; }
        .hap-feature p { line-height: 1.5; opacity: .85; font-size: 14px; }
        .hap-login-box { width: 50%; display: flex; justify-content: center; }
        .hap-card {
          width: 560px;
          background: white;
          color: #0A1B3D;
          padding: 56px;
          border-radius: 28px;
          box-shadow: 0 30px 80px rgba(0,0,0,.25);
        }
        .hap-card-header {
          border-left: 5px solid #FF7900;
          padding-left: 22px;
          margin-bottom: 48px;
        }
        .hap-card-header h2 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
        .hap-card-header p { color: #69758B; font-size: 15px; }
        .hap-label { display: block; font-weight: 700; font-size: 14px; margin-bottom: 10px; color: #0A1B3D; }
        .hap-input {
          width: 100%;
          height: 54px;
          border: 1.5px solid #CBD5E1;
          border-radius: 10px;
          margin-bottom: 24px;
          padding: 0 18px;
          font-size: 15px;
          font-family: 'Inter', sans-serif;
          color: #0A1B3D;
          outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .hap-input:focus { border-color: #003B85; box-shadow: 0 0 0 4px rgba(0,59,133,0.1); }
        .hap-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          margin-bottom: 36px;
        }
        .hap-options label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500; color: #334155; }
        .hap-error {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          color: #DC2626;
          border-radius: 8px;
          padding: 12px 14px;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .hap-btn {
          width: 100%;
          height: 58px;
          border: none;
          border-radius: 10px;
          background: #003B85;
          color: white;
          font-size: 17px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: background .25s;
        }
        .hap-btn:hover:not(:disabled) { background: #FF7900; }
        .hap-btn:disabled { opacity: .7; cursor: not-allowed; }
        .hap-sso {
          margin-top: 36px;
          text-align: center;
          color: #0057B8;
          font-weight: 600;
          font-size: 14px;
        }
        .hap-footer {
          position: fixed;
          bottom: 30px;
          left: 60px;
          font-size: 13px;
          opacity: .8;
        }
        .hap-version {
          position: fixed;
          right: 60px;
          bottom: 30px;
          font-size: 13px;
          opacity: .7;
        }
        @media (max-width: 900px) {
          .hap-container { flex-direction: column; padding: 40px 20px; padding-top: 100px; }
          .hap-info { display: none; }
          .hap-login-box { width: 100%; }
          .hap-card { width: 100%; padding: 36px 28px; }
        }
        
      `}</style>

      <div className="hap-body">
        {/* Marca d'água */}
        {/* <div className="hap-watermark">✤</div> */}
        <img src="/flor-hapvida.png" alt="" className="hm-watermark" />

        {/* Logo */}
        <div className="hap-logo">
          {/* Se tiver a imagem da logo, descomente a linha abaixo e apague o texto */}
          <img src="/logo-hapvida.png" alt="Hapvida" />
          {/* <div className="hap-logo-text">Hapvida <span>|</span> TI</div> */}
        </div>

        <div className="hap-container">

          {/* ── Lado esquerdo: informações ── */}
          <section className="hap-info">
            <h1 className="hap-title">
              Plataforma | <span>Governança TI</span>
            </h1>
            <div className="hap-subtitle">Portfólio e evolução das iniciativas</div>
            <div className="hap-line" />
            <p className="hap-description">
              Acompanhe o progresso das demandas e a gestão do portfólio.
            </p>
            <div className="hap-features">
              {[
                { icon:'⌖', title:'Visão estratégica',  desc:'Alinhamento com prioridades corporativas' },
                { icon:'▣', title:'Gestão integrada',   desc:'Demandas, projetos e iniciativas em um só lugar' },
                { icon:'▥', title:'Decisões melhores',  desc:'Informações atualizadas para gestão eficiente' },
              ].map(f => (
                <div key={f.title} className="hap-feature">
                  <div className="hap-icon">{f.icon}</div>
                  <strong>{f.title}</strong>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Lado direito: formulário ── */}
          <section className="hap-login-box">
            <div className="hap-card">
              <div className="hap-card-header">
                <h2>Acesso ao sistema</h2>
                <p>Entre com suas credenciais para continuar</p>
              </div>

              <form onSubmit={handleSubmit}>
                <label className="hap-label">Email corporativo</label>
                <input className="hap-input" type="email" placeholder="seu@email.com.br"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />

                <label className="hap-label">Senha</label>
                <input className="hap-input" type="password" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />

                <div className="hap-options">
                  <label>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                      style={{ accentColor:'#003B85', width:15, height:15 }} />
                    Lembrar meu acesso
                  </label>
                </div>

                {error && <div className="hap-error">{error}</div>}

                <button type="submit" disabled={loading} className="hap-btn">
                  {loading ? 'Entrando…' : 'Entrar no sistema →'}
                </button>
              </form>

             
            </div>
          </section>

        </div>

        {/* Rodapé */}
        <div className="hap-footer">© 2026 Hapvida | Governança TI &nbsp;|&nbsp; Uso interno</div>
        <div className="hap-version">v1.0.0</div>
      </div>
    </>
  )
}
