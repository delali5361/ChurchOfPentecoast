import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BrandMark, Icon } from '../components/Icon';

export function SignInPage({ client, onStartOnboarding }: { client: SupabaseClient; onStartOnboarding?: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const { error, data } = mode === 'sign-in'
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === 'sign-up' && !data.session) setMessage('Check your email to confirm your account before signing in.');
    else if (mode === 'sign-up') setMessage('Your account is ready. You can now open the workspace.');
  };
  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    const { error } = await client.auth.resetPasswordForEmail(email);
    setMessage(error ? error.message : 'If an account matches that address, a password reset link is on its way.');
  };

  return <main className="auth-screen">
    <section className="auth-visual">
      <div className="auth-logo"><BrandMark /><strong>Grace Assembly</strong></div>
      <div className="auth-quote"><span className="welcome-label"><Icon name="shield" size={14} /> CHURCH WORKSPACE</span><h1>Care for your people.<br /><em>Lead with clarity.</em></h1><p>A considered, secure home for the people and ministry work that matters most.</p></div>
      <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
    </section>
    <div className="auth-card-wrap"><section className="auth-card">
      <div className="auth-card-heading"><BrandMark /><span>Grace Assembly workspace</span><h2>{mode === 'sign-in' ? 'Welcome back' : 'Create your access'}</h2><p>{mode === 'sign-in' ? 'Sign in to continue to your church workspace.' : 'Create an account to request access to your church workspace.'}</p></div>
      <form onSubmit={submit}><label>Email address<input type="email" name="email" required autoComplete="username" placeholder="you@church.org" /></label>
        <label>Password<input type="password" name="password" required minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" /></label>
        {message && <div className="form-message" role="status">{message}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Working...' : mode === 'sign-in' ? 'Sign in securely' : 'Create account'} <Icon name="arrow-up" size={16} /></button>
      </form>
      <button className="auth-switch" onClick={() => { setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>{mode === 'sign-in' ? 'Setting up your church? Start here' : 'Already have access? Sign in'}</button>
      {mode === 'sign-in' && <form className="password-reset-form" onSubmit={resetPassword}><label htmlFor="reset-email">Forgot your password?</label><input type="email" name="email" id="reset-email" required autoComplete="email" placeholder="Enter your account email" /><button type="submit" className="text-button">Send reset link <Icon name="arrow-up" size={13} /></button></form>}
      {mode === 'sign-up' && <button type="button" className="onboarding-link" onClick={onStartOnboarding} style={{ marginTop: '1rem', padding: '0.5rem', fontSize: '0.9rem', color: '#667eea', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Skip manual setup → Go to full onboarding wizard</button>}
      <small className="auth-note"><Icon name="lock" size={13} /> Protected with Supabase authentication</small>
    </section></div>
  </main>;
}

