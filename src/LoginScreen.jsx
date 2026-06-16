import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
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
          ? 'Email ou senha incorretos.'
          : err.message === 'Email not confirmed'
          ? 'Confirme seu email antes de entrar.'
          : 'Erro ao entrar. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        {/* Logo / cabeçalho */}
        <div style={styles.header}>
          <div style={styles.bar} />
          <div>
            <div style={styles.title}>Status Semanal</div>
            <div style={styles.subtitle}>Marcos e Cronogramas · Hapvida</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com.br"
            required
            style={styles.input}
            autoComplete="email"
          />

          <label style={styles.label}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={styles.input}
            autoComplete="current-password"
          />

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div style={styles.footer}>
          Acesso restrito · Entre em contato com o administrador para obter acesso.
        </div>
      </div>
    </div>
  )
}

const styles = {
  bg: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #003B82 0%, #0055BB 60%, #1a6fd4 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    padding: '40px 36px 32px',
    width: '100%',
    maxWidth: 400,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 32,
  },
  bar: {
    width: 5,
    height: 48,
    background: '#F47B20',
    borderRadius: 3,
    flexShrink: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#003B82',
    lineHeight: 1.2,
    fontFamily: "'Fraunces', serif",
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    border: '1.5px solid #CBD5E1',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: '#1e293b',
    outline: 'none',
    width: '100%',
    transition: 'border-color .15s',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#DC2626',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    marginTop: 4,
  },
  btn: {
    marginTop: 20,
    background: '#003B82',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
    transition: 'background .15s',
  },
  footer: {
    marginTop: 24,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
