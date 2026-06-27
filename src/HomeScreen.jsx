import { useAuth } from './AuthContext'

export default function HomeScreen({ onAcessarPortfolio, onAcessarStatus, onAcessarRas }) {
  const { profile, signOut } = useAuth()

  // Iniciais do avatar
  const iniciais = (profile?.name || profile?.email || 'US')
    .split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; font-family:'Inter',sans-serif; }
        .hm-body {
          min-height: 100vh;
          background: linear-gradient(135deg, #001F4E 0%, #003B85 55%, #0057B8 100%);
          color: white;
          overflow-x: hidden;
          position: relative;
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
        .hm-header {
          height: 100px;
          padding: 0 65px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          z-index: 2;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .hm-brand {
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .hm-logo-img {
          height: 44px;
          width: auto;
        }
        .hm-logo-text {
          font-size: 20px;
          font-weight: 800;
          color: white;
        }
        .hm-logo-text span { color: #FF7900; }
        .hm-separator {
          height: 40px;
          width: 1px;
          background: rgba(255,255,255,.25);
        }
        .hm-system-name {
          font-size: 18px;
          font-weight: 600;
          opacity: .9;
        }
        .hm-system-name span { color: #FF7900; }
        .hm-user {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .hm-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,.6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          background: rgba(255,255,255,.12);
          flex-shrink: 0;
        }
        .hm-user-name { font-weight: 600; font-size: 15px; }
        .hm-user-email { font-size: 13px; opacity: .7; margin-top: 2px; }
        .hm-logout-btn {
          margin-left: 8px;
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.2);
          color: white;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background .2s;
        }
        .hm-logout-btn:hover { background: rgba(255,255,255,.2); }
        .hm-container {
          position: relative;
          z-index: 2;
          max-width: 1100px;
          margin: 60px auto;
          padding: 0 30px 120px;
        }
        .hm-title { font-size: 42px; font-weight: 800; margin-bottom: 20px; }
        .hm-orange-line { width: 70px; height: 4px; background: #FF7900; border-radius: 2px; margin-bottom: 30px; }
        .hm-subtitle { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
        .hm-text { font-size: 17px; opacity: .85; margin-bottom: 50px; line-height: 1.6; }
        .hm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32px; margin-bottom: 40px; }
        .hm-card {
          background: white;
          color: #071B42;
          border-radius: 24px;
          padding: 48px 36px;
          text-align: center;
          box-shadow: 0 30px 70px rgba(0,0,0,.20);
          transition: transform .25s, box-shadow .25s;
          cursor: default;
        }
        .hm-card:hover { transform: translateY(-8px); box-shadow: 0 40px 90px rgba(0,0,0,.30); }
        .hm-card-icon {
          width: 86px;
          height: 86px;
          margin: 0 auto 32px;
          background: #EEF4FF;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          color: #0057B8;
        }
        .hm-card h2 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .hm-card h3 { color: #0057B8; font-size: 15px; font-weight: 600; margin-bottom: 24px; }
        .hm-card p { line-height: 1.8; color: #667085; font-size: 16px; margin-bottom: 40px; }
        .hm-card-btn {
          width: 100%;
          height: 54px;
          border: none;
          border-radius: 10px;
          background: #003B85;
          color: white;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: background .25s;
        }
        .hm-card-btn:hover { background: #FF7900; }
        .hm-future {
          margin: 0 auto;
          max-width: 800px;
          padding: 22px 28px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 14px;
          text-align: center;
          background: rgba(255,255,255,.04);
          font-size: 15px;
          opacity: .85;
          line-height: 1.6;
        }
        .hm-footer {
          position: fixed;
          bottom: 28px;
          left: 65px;
          right: 65px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          opacity: .65;
          z-index: 2;
        }
        @media (max-width: 900px) {
          .hm-header { height: auto; padding: 24px 24px; flex-wrap: wrap; gap: 16px; }
          .hm-separator { display: none; }
          .hm-container { margin: 32px auto; padding: 0 20px 100px; }
          .hm-title { font-size: 30px; }
          .hm-cards { grid-template-columns: 1fr; }
          .hm-footer { position: relative; left: auto; right: auto; padding: 0 20px 20px; flex-direction: column; gap: 4px; align-items: center; }
        }
      `}</style>

      <div className="hm-body">
        {/* Marca d'água */}
        {/* <div className="hap-watermark">✤</div> */}
        <img src="/flor-hapvida.png" alt="" className="hm-watermark" />

        {/* Header */}
        <header className="hm-header">
          <div className="hm-brand">
            {/* Logo: descomente a img e apague o texto quando tiver o arquivo */}
            <img src="/logo-hapvida.png" alt="Hapvida" className="hm-logo-img" />
            {/* <div className="hm-logo-text">Hapvida <span>|</span> TI</div> */}
            <div className="hm-separator" />
            <div className="hm-system-name">Plataforma | <span>Governança TI</span></div>
          </div>

          <div className="hm-user">
            <div className="hm-avatar">{iniciais}</div>
            <div>
              <div className="hm-user-name">{profile?.name || 'Usuário'}</div>
              <div className="hm-user-email">{profile?.email}</div>
            </div>
            <button className="hm-logout-btn" onClick={signOut}>Sair</button>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="hm-container">
          <h1 className="hm-title">Bem-vindo(a){profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!</h1>
          <div className="hm-orange-line" />
          <div className="hm-subtitle">O que deseja acompanhar hoje?</div>
          <p className="hm-text">Acesse informações estratégicas ou atualize a evolução das iniciativas.</p>

          <section className="hm-cards">
            <div className="hm-card">
              <div className="hm-card-icon">📁</div>
              <h2>Portfólio</h2>
              <h3>Visão geral</h3>
              <p>Acompanhe o portfólio de iniciativas, status dos projetos e indicadores estratégicos.</p>
              <button className="hm-card-btn" disabled style={{ opacity:.45, cursor:'not-allowed', background:'#94a3b8' }}>Em breve</button>
            </div>

            <div className="hm-card">
              <div className="hm-card-icon">📊</div>
              <h2>Atualizar Status</h2>
              <h3>Status Report</h3>
              <p>Registre progresso das iniciativas, acompanhe marcos, entregas e evolução.</p>
              <button className="hm-card-btn" onClick={onAcessarStatus}>Acessar →</button>
            </div>

            <div className="hm-card">
              <div className="hm-card-icon">📅</div>
              <h2>Atualizar RAS</h2>
              <h3>Reunião de Acompanhamento Semanal</h3>
              <p>Gere o Status Report Executivo da RAS a partir do Portfólio e Melhorias da semana.</p>
              <button className="hm-card-btn" onClick={onAcessarRas}>Acessar →</button>
            </div>
          </section>

          <div className="hm-future">
            ℹ️ Em breve, novas funcionalidades estarão disponíveis para apoiar ainda mais a gestão e governança do portfólio de TI.
          </div>
        </main>

        {/* Footer */}
        <footer className="hm-footer">
          <span>© 2026 Hapvida | Governança TI | Uso interno</span>
          <span>v1.0.0</span>
        </footer>
      </div>
    </>
  )
}
