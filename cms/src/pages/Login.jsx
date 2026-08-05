import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@faderoom.app');
  const [password, setPassword] = useState('password1');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 22 }}>
          <div className="brand" style={{ padding: 0 }}>
            <div className="mark">✂</div>
            <div>
              <b style={{ fontSize: 17 }}>FadeRoom</b>
              <span>Back office</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Sign in</h2>
          <div className="hint">Artist and admin accounts only.</div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className={`input ${error ? 'err' : ''}`}
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={`input ${error ? 'err' : ''}`}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <div className="err-msg">{error}</div>}
          </div>

          <button className="btn block" style={{ marginTop: 18 }} disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <div className="hint" style={{ textAlign: 'center', marginTop: 14, lineHeight: 1.7 }}>
          Seeded logins — admin@faderoom.app · karim@faderoom.app
          <br />
          password1
        </div>
      </form>
    </div>
  );
}
