import { useState } from 'react'

const DOMINIO = '@hapvida.com.br'

// Tela pública de solicitação de acesso.
// A pessoa escolhe a própria senha; a conta nasce pendente e só é
// liberada após aprovação de um admin (ver api/admin-usuarios.js).
export default function SolicitarAcessoScreen({ onBack }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim())                             return setError('Informe seu nome.')
    if (!email.trim().toLowerCase().endsWith(DOMINIO))
                                                  return setError(`O e-mail precisa terminar em ${DOMINIO}.`)
    if (password.length < 6)                      return setError('A senha deve ter ao menos 6 caracteres.')
    if (password !== confirm)                     return setError('As senhas não coincidem.')

    setLoading(true)
    try {
      const resp = await fetch('/api/admin-usuarios', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'solicitar', name, email, password }),
      })
      let json = {}
      try { json = await resp.json() } catch (_) {}
      if (!resp.ok) throw new Error(json.error || 'Não foi possível enviar a solicitação.')
      setEnviado(true)
    } catch (err) {
      setError(err.message || 'Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; font-family:'Inter',sans-serif; }
        .sa-body {
          min-height:100vh;
          background:linear-gradient(135deg,#001F4E 0%,#003B85 55%,#0057B8 100%);
          color:white; position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:center; padding:40px 20px;
        }
        .sa-logo { position:absolute; top:45px; left:60px; }
        .sa-logo img { height:48px; width:auto; }
        .sa-card {
          width:100%; max-width:520px; background:white; color:#0A1B3D;
          padding:48px; border-radius:28px; box-shadow:0 30px 80px rgba(0,0,0,.25);
        }
        .sa-header { border-left:5px solid #FF7900; padding-left:22px; margin-bottom:36px; }
        .sa-header h2 { font-size:26px; font-weight:700; margin-bottom:6px; }
        .sa-header p { color:#69758B; font-size:15px; }
        .sa-label { display:block; font-weight:700; font-size:14px; margin-bottom:8px; color:#0A1B3D; }
        .sa-input {
          width:100%; height:52px; border:1.5px solid #CBD5E1; border-radius:10px;
          margin-bottom:20px; padding:0 16px; font-size:15px; color:#0A1B3D;
          outline:none; transition:border-color .2s, box-shadow .2s;
        }
        .sa-input:focus { border-color:#003B85; box-shadow:0 0 0 4px rgba(0,59,133,0.1); }
        .sa-hint { font-size:12px; color:#64748b; margin-top:-14px; margin-bottom:20px; }
        .sa-error {
          background:#FEF2F2; border:1px solid #FECACA; color:#DC2626;
          border-radius:8px; padding:12px 14px; font-size:14px; margin-bottom:20px;
        }
        .sa-btn {
          width:100%; height:56px; border:none; border-radius:10px; background:#003B85;
          color:white; font-size:16px; font-weight:700; cursor:pointer; transition:background .25s;
        }
        .sa-btn:hover:not(:disabled) { background:#FF7900; }
        .sa-btn:disabled { opacity:.7; cursor:not-allowed; }
        .sa-back {
          margin-top:24px; text-align:center; font-size:14px; font-weight:600;
          color:#0057B8; cursor:pointer; background:none; border:none; width:100%;
        }
        .sa-ok { text-align:center; }
        .sa-ok .sa-check {
          width:64px; height:64px; border-radius:50%; background:#F0FDF4;
          display:flex; align-items:center; justify-content:center; margin:0 auto 20px;
          font-size:32px; color:#16A34A; border:2px solid #BBF7D0;
        }
        .sa-ok h2 { font-size:24px; font-weight:700; color:#0A1B3D; margin-bottom:12px; }
        .sa-ok p { color:#475569; font-size:15px; line-height:1.6; margin-bottom:28px; }
      `}</style>

      <div className="sa-body">
        <div className="sa-logo">
          <img src="/logo-hapvida.png" alt="Hapvida" />
        </div>

        <div className="sa-card">
          {enviado ? (
            <div className="sa-ok">
              <div className="sa-check">✓</div>
              <h2>Solicitação enviada!</h2>
              <p>
                Seu cadastro foi registrado e está aguardando a aprovação de um
                administrador. Assim que for liberado, você poderá entrar com o
                e-mail e a senha que acabou de cadastrar.
              </p>
              <button className="sa-btn" onClick={onBack}>Voltar ao login</button>
            </div>
          ) : (
            <>
              <div className="sa-header">
                <h2>Solicitar acesso</h2>
                <p>Preencha seus dados. O acesso é liberado após aprovação.</p>
              </div>

              <form onSubmit={handleSubmit}>
                <label className="sa-label">Nome completo</label>
                <input className="sa-input" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Seu nome" autoComplete="name" />

                <label className="sa-label">E-mail corporativo</label>
                <input className="sa-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={`seu.nome${DOMINIO}`} autoComplete="email" />
                <div className="sa-hint">Apenas e-mails {DOMINIO} são aceitos.</div>

                <label className="sa-label">Senha</label>
                <input className="sa-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres" autoComplete="new-password" />

                <label className="sa-label">Confirmar senha</label>
                <input className="sa-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha" autoComplete="new-password" />

                {error && <div className="sa-error">{error}</div>}

                <button type="submit" disabled={loading} className="sa-btn">
                  {loading ? 'Enviando…' : 'Enviar solicitação'}
                </button>
              </form>

              <button className="sa-back" onClick={onBack}>← Voltar ao login</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
