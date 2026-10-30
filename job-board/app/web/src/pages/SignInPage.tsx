// S-08 Sign in (UC-08). Sign out (UC-09) ends here too, with a confirmation.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiRequestError } from '../api';
import { landingPage, useAuth } from '../auth';
import { errorProps, Field, Notice, Page } from '../components/ui';

interface SignInState {
  from?: string;
  notice?: string;
  signedOut?: boolean;
}

export function SignInPage() {
  const { user, signIn } = useAuth();
  const state = (useLocation().state ?? {}) as SignInState;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Signed in (just now, or already): go where the person was heading.
  if (user) return <Navigate to={landingPage(user, state.from)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    // TC-08-4: empty fields are highlighted and nothing is sent.
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Enter your email address.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fields);
        setMessage(err.status === 422 ? '' : err.message);
        if (err.status === 401) setPassword('');
      } else {
        setMessage('Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <Page>
      {state.signedOut && <Notice kind="ok"><b>You have been signed out.</b></Notice>}
      {state.notice && <Notice kind="info"><b>{state.notice}</b></Notice>}
      <div className="card" style={{ maxWidth: 440, margin: '24px auto 14px' }}>
        <h1>Sign in</h1>
        <p className="muted">Use the email and password for your account.</p>
        {message && <Notice kind="err"><b>{message}</b></Notice>}
        <form onSubmit={submit} noValidate>
          <Field id="email" label="Email" error={fieldErrors.email}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              {...errorProps('email', fieldErrors.email)}
            />
          </Field>
          <Field id="password" label="Password" error={fieldErrors.password}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...errorProps('password', fieldErrors.password)}
            />
          </Field>
          <button className="btn" type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
      </div>
      <div className="card" style={{ maxWidth: 440, margin: '0 auto', background: 'var(--accent-soft)', borderColor: '#a7d7d2' }}>
        <h3>Demo accounts</h3>
        <p className="small" style={{ marginBottom: 6 }}>
          Accounts are pre-created. Every demo account uses the password <b>demo1234</b>.
        </p>
        <ul className="small" style={{ margin: '0 0 0 18px', padding: 0 }}>
          <li>
            Job seeker: <b>alex.chen@example.com</b>
          </li>
          <li>
            Employer: <b>hiring@northwind.example</b>
          </li>
        </ul>
      </div>
    </Page>
  );
}
