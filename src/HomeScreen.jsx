import { useState, useEffect } from 'react'
import { FolderOpen, BarChart2, CalendarCheck, Info, LogOut, ClipboardList, Shield, Filter, ChevronDown, AlertTriangle, Presentation } from 'lucide-react'
import { useAuth } from './AuthContext'

export default function HomeScreen({ onAcessarPortfolio, onAcessarStatus, onAcessarRas, onAcessarIncidentes, onAcessarKanban, onAcessarReuniao, onAcessarGestao, onAcessarAuditoria }) {
  const { profile, signOut, isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const podeReuniao = !!profile?.pode_reuniao

  // Fecha o menu ao clicar fora dele
  useEffect(() => {
    if (!menuOpen) return
    const fechar = (e) => { if (!e.target.closest('.hm-user')) setMenuOpen(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [menuOpen])

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
          width: 600px;
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
          z-index: 20;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .hm-brand {
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .hm-logo-img { height: 44px; width: auto; }
        .hm-logo-text { font-size: 20px; font-weight: 800; color: white; }
        .hm-logo-text span { color: #FF7900; }
        .hm-separator { height: 40px; width: 1px; background: rgba(255,255,255,.25); }
        .hm-system-name { font-size: 18px; font-weight: 600; opacity: .9; }
        .hm-system-name span { color: #FF7900; }

        /* ── Menu de conta (dropdown) ── */
        .hm-user { position: relative; z-index: 30; }
        .hm-user-trigger {
          display: flex; align-items: center; gap: 14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 14px; padding: 8px 16px 8px 8px;
          cursor: pointer; color: white;
          font-family: 'Inter', sans-serif;
          transition: background .2s;
        }
        .hm-user-trigger:hover { background: rgba(255,255,255,.14); }
        .hm-avatar {
          width: 48px; height: 48px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,.6);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 16px;
          background: rgba(255,255,255,.12); flex-shrink: 0;
        }
        .hm-user-info { text-align: left; }
        .hm-user-name { font-weight: 600; font-size: 15px; }
        .hm-user-email { font-size: 13px; opacity: .7; margin-top: 2px; }
        .hm-chevron { opacity: .8; transition: transform .2s; }
        .hm-chevron.open { transform: rotate(180deg); }

        .hm-menu-overlay { position: fixed; inset: 0; z-index: 40; }
        .hm-menu {
          position: absolute; right: 0; top: calc(100% + 8px);
          background: #fff; color: #334155;
          border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.22);
          padding: 8px; min-width: 220px; z-index: 1000;
        }
        .hm-menu-head {
          padding: 6px 12px 10px; font-size: 12px; color: #94a3b8;
          border-bottom: 1px solid #f1f5f9; margin-bottom: 6px;
        }
        .hm-menu-item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          background: none; border: none; padding: 9px 12px; cursor: pointer;
          color: #334155; font-size: 14px; font-weight: 500; border-radius: 8px;
          font-family: 'Inter', sans-serif; text-align: left;
          line-height: 1.4; white-space: nowrap;
        }
        .hm-menu-item svg { flex-shrink: 0; }
        .hm-menu-item:hover { background: #F1F5F9; }
        .hm-menu-item.danger { color: #DC2626; }
        .hm-menu-item.danger:hover { background: #FEF2F2; }
        .hm-menu-sep { border-top: 1px solid #f1f5f9; margin: 6px 0; }

        .hm-container {
          position: relative; z-index: 2;
          max-width: 1100px; margin: 60px auto;
          padding: 0 30px 120px;
        }
        .hm-title { font-size: 42px; font-weight: 800; margin-bottom: 20px; }
        .hm-orange-line { width: 70px; height: 4px; background: #FF7900; border-radius: 2px; margin-bottom: 30px; }
        .hm-subtitle { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
        .hm-text { font-size: 17px; opacity: .85; margin-bottom: 50px; line-height: 1.6; }
        .hm-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 32px; margin-bottom: 40px;
        }
        .hm-card {
          background: white; color: #071B42;
          border-radius: 24px; padding: 48px 36px;
          text-align: center;
          box-shadow: 0 30px 70px rgba(0,0,0,.20);
          transition: transform .25s, box-shadow .25s;
          cursor: default;
        }
        .hm-card:hover { transform: translateY(-8px); box-shadow: 0 40px 90px rgba(0,0,0,.30); }
        .hm-card-icon {
          width: 86px; height: 86px;
          margin: 0 auto 32px;
          background: #EEF4FF; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #0057B8;
        }
        .hm-card h2 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .hm-card h3 { color: #0057B8; font-size: 15px; font-weight: 600; margin-bottom: 24px; }
        .hm-card p { line-height: 1.8; color: #667085; font-size: 16px; margin-bottom: 40px; }
        .hm-card-btn {
          width: 100%; height: 54px; border: none; border-radius: 10px;
          background: #003B85; color: white;
          font-size: 16px; font-weight: 700;
          font-family: 'Inter', sans-serif;
          cursor: pointer; transition: background .25s;
        }
        .hm-card-btn:hover { background: #FF7900; }
        .hm-future {
          margin: 0 auto; max-width: 900px;
          padding: 20px 28px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 14px; text-align: center;
          background: rgba(255,255,255,.04);
          font-size: 15px; opacity: .85; line-height: 1.6;
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .hm-footer {
          position: fixed; bottom: 28px; left: 65px; right: 65px;
          display: flex; justify-content: space-between;
          font-size: 13px; opacity: .65; z-index: 2;
        }
        @media (max-width: 900px) {
          .hm-header { height: auto; padding: 24px; flex-wrap: wrap; gap: 16px; }
          .hm-separator { display: none; }
          .hm-container { margin: 32px auto; padding: 0 20px 100px; }
          .hm-title { font-size: 30px; }
          .hm-cards { grid-template-columns: 1fr; }
          .hm-footer { position: relative; left: auto; right: auto; padding: 0 20px 20px; flex-direction: column; gap: 4px; align-items: center; }
        }
      `}</style>

      <div className="hm-body">
        <img src="/flor-hapvida.png" alt="" className="hm-watermark" />

        <header className="hm-header">
          <div className="hm-brand">
            <img src="/logo-hapvida.png" alt="Hapvida" className="hm-logo-img" />
            <div className="hm-separator" />
            <div className="hm-system-name">Plataforma | <span>Governança TI</span></div>
          </div>

          {/* Menu de conta */}
          <div className="hm-user">
            <button className="hm-user-trigger" onClick={() => setMenuOpen(o => !o)}>
              <div className="hm-avatar">{iniciais}</div>
              <div className="hm-user-info">
                <div className="hm-user-name">{profile?.name || 'Usuário'}</div>
                <div className="hm-user-email">{profile?.email}</div>
              </div>
              <ChevronDown size={18} className={`hm-chevron${menuOpen ? ' open' : ''}`} />
            </button>

            {menuOpen && (
              <div className="hm-menu">
                  <div className="hm-menu-head">{profile?.email}</div>
                  {isAdmin && (
                    <>
                      <button className="hm-menu-item" onClick={() => { setMenuOpen(false); onAcessarGestao?.() }}>
                        <Shield size={15} color="#7030A0" /> Gestão de Usuários
                      </button>
                      <button className="hm-menu-item" onClick={() => { setMenuOpen(false); onAcessarAuditoria?.() }}>
                        <Filter size={15} color="#2F5597" /> Auditoria
                      </button>
                      <div className="hm-menu-sep" />
                    </>
                  )}
                  <button className="hm-menu-item danger" onClick={() => { setMenuOpen(false); signOut() }}>
                    <LogOut size={15} /> Sair
                  </button>
                </div>
            )}
          </div>
        </header>

        <main className="hm-container">
          <h1 className="hm-title">Bem-vindo(a){profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!</h1>
          <div className="hm-orange-line" />
          <div className="hm-subtitle">O que deseja acompanhar hoje?</div>
          <p className="hm-text">Acesse informações estratégicas ou atualize a evolução das iniciativas.</p>

          <section className="hm-cards">
            {/* Card Portfólio */}
            <div className="hm-card">
              <div className="hm-card-icon">
                <FolderOpen size={40} />
              </div>
              <h2>Portfólio</h2>
              <h3>Visão geral</h3>
              <p>Acompanhe o portfólio de iniciativas, status dos projetos e indicadores estratégicos.</p>
              <button className="hm-card-btn" onClick={onAcessarPortfolio}>Acessar →</button>
            </div>

            {/* Card Atualizar Status */}
            <div className="hm-card">
              <div className="hm-card-icon">
                <BarChart2 size={40} />
              </div>
              <h2>Atualizar Status</h2>
              <h3>Status Report</h3>
              <p>Registre progresso das iniciativas, acompanhe marcos, entregas e evolução.</p>
              <button className="hm-card-btn" onClick={onAcessarStatus}>Acessar →</button>
            </div>

            {/* Card Atualizar RAS */}
            <div className="hm-card">
              <div className="hm-card-icon">
                <CalendarCheck size={40} />
              </div>
              <h2>Atualizar RAS</h2>
              <h3>Reunião de Acompanhamento Semanal</h3>
              <p>Gere o Status Report Executivo da RAS a partir do Portfólio e Melhorias da semana.</p>
              <button className="hm-card-btn" onClick={onAcessarRas}>Acessar →</button>
            </div>

            {/* Card Atualizar Incidentes */}
            <div className="hm-card">
              <div className="hm-card-icon">
                <AlertTriangle size={40} />
              </div>
              <h2>Atualizar Incidentes</h2>
              <h3>Report Semanal de Incidentes</h3>
              <p>Gere o Dashboard Executivo de Incidentes a partir da base exportada do Azure.</p>
              <button className="hm-card-btn" onClick={onAcessarIncidentes}>Acessar →</button>
            </div>

            {/* Card Reunião — só para quem tem a permissão.
                Quem não tem vê o card apagado, com o motivo. Esconder por
                completo faria a pessoa achar que o sistema tem menos do que
                tem, e ela nunca saberia que existe algo a pedir. */}
            <div className="hm-card" style={podeReuniao ? undefined : { opacity: .55 }}>
              <div className="hm-card-icon">
                <Presentation size={40} />
              </div>
              <h2>Reunião</h2>
              <h3>Montagem e apresentação</h3>
              <p></p>
              {podeReuniao ? (
                <button className="hm-card-btn" onClick={onAcessarReuniao}>Acessar →</button>
              ) : (
                <button className="hm-card-btn" disabled
                        style={{ background: '#94A3B8', cursor: 'not-allowed' }}
                        title="Peça a um administrador para liberar em Gestão de Usuários">
                  Sem acesso
                </button>
              )}
            </div>

            {/* Card Tarefas & Reuniões */}
            <div className="hm-card">
              <div className="hm-card-icon">
                <ClipboardList size={40} />
              </div>
              <h2>Tarefas &amp; Reuniões</h2>
              <h3>Quadro de atividades</h3>
              <p>Organize as tarefas da equipe em quadro Kanban e gere ações automáticas a partir das atas de reunião.</p>
              <button className="hm-card-btn" onClick={onAcessarKanban}>Acessar →</button>
            </div>
            
          </section>

          <div className="hm-future">
            <Info size={17} style={{ flexShrink: 0, opacity: .8 }} />
            Em breve, novas funcionalidades estarão disponíveis para apoiar ainda mais a gestão e governança do portfólio de TI.
          </div>
        </main>

        <footer className="hm-footer">
          <span>© 2026 Hapvida | Governança TI | Uso interno</span>
          <span>v1.0.0</span>
        </footer>
      </div>
    </>
  )
}
