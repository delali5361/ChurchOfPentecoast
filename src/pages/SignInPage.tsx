import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BrandMark, Icon } from '../components/Icon';

export function SignInPage({ client, initialMode = 'sign-in', onBack, onPreviewAccess }: {
  client: SupabaseClient | null;
  initialMode?: 'sign-in' | 'sign-up';
  onBack: () => void;
  onPreviewAccess?: () => void;
}) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) {
      setMessage(mode === 'sign-in'
        ? 'Sign-in form preview: authentication will be connected in the backend phase.'
        : 'Member sign-up form preview: account creation will be connected in the backend phase.');
      return;
    }
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    try {
      const result = mode === 'sign-in'
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: String(form.get('first_name') ?? '').trim(),
              last_name: String(form.get('last_name') ?? '').trim(),
              preferred_name: String(form.get('preferred_name') ?? '').trim(),
              phone: String(form.get('phone') ?? '').trim(),
            },
          },
        });
      if (result.error) setMessage(result.error.message);
      else if (mode === 'sign-up' && !result.data.session) setMessage('Check your email to confirm your account. Your account will start with Member access.');
      else if (mode === 'sign-up') setMessage('Your Member account is ready. Opening your church workspace.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not complete authentication.');
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) {
      setMessage('Password reset will be connected in the backend phase.');
      return;
    }
    setBusy(true);
    setMessage('');
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    try {
      const { error } = await client.auth.resetPasswordForEmail(email);
      setMessage(error ? error.message : 'If an account matches that address, a password reset link is on its way.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not request a password reset.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-screen">
    <section className="auth-visual">
      <button className="auth-back-button" onClick={onBack}><Icon name="chevron-left" size={15} /> Back to Grace Assembly</button>
      <div className="auth-logo"><BrandMark /><strong>Grace Assembly</strong></div>
      <div className="auth-quote"><span className="welcome-label"><Icon name="shield" size={14} /> CHURCH WORKSPACE</span><h1>Care for your people.<br /><em>Lead with clarity.</em></h1><p>A considered, secure home for the people and ministry work that matters most.</p></div>
      <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
    </section>
    <div className="auth-card-wrap"><section className="auth-card">
      <div className="auth-card-heading"><BrandMark /><span>Grace Assembly workspace</span><h2>{mode === 'sign-in' ? 'Welcome back' : 'Create your access'}</h2><p>{mode === 'sign-in' ? 'Sign in to continue to your church workspace.' : 'Create an account to request access to your church workspace.'}</p>{!client && <p className="auth-preview-note">Frontend preview: this form is not connected to account services yet.</p>}</div>
      <form onSubmit={submit}>
        {mode === 'sign-up' && <>
          <label>First name<input type="text" name="first_name" required autoComplete="given-name" maxLength={80} placeholder="First name" /></label>
          <label>Last name<input type="text" name="last_name" required autoComplete="family-name" maxLength={80} placeholder="Last name" /></label>
          <label>Preferred name <span>(optional)</span><input type="text" name="preferred_name" autoComplete="nickname" maxLength={80} placeholder="What should we call you?" /></label>
          <label>Phone <span>(optional)</span><input type="tel" name="phone" autoComplete="tel" maxLength={40} placeholder="Phone number" /></label>
        </>}
        <label>Email address<input type="email" name="email" required autoComplete="username" placeholder="you@church.org" /></label>
        <label>Password<input type="password" name="password" required minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" /></label>
        {message && <div className="form-message" role="status">{message}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Working...' : mode === 'sign-in' ? 'Sign in securely' : 'Create account'} <Icon name="arrow-up" size={16} /></button>
      </form>
      <button className="auth-switch" onClick={() => { setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>{mode === 'sign-in' ? 'New to Grace Assembly? Create a Member account' : 'Already have an account? Sign in'}</button>
      {!client && onPreviewAccess && <div className="auth-preview-access">
        <span>Just exploring?</span>
        <button className="button button-ghost" type="button" onClick={onPreviewAccess}>Bypass sign-in and open preview</button>
        <small>Preview access is local only and does not authenticate an account.</small>
      </div>}
      {mode === 'sign-in' && <form className="password-reset-form" onSubmit={resetPassword}><label htmlFor="reset-email">Forgot your password?</label><input type="email" name="email" id="reset-email" required autoComplete="email" placeholder="Enter your account email" /><button type="submit" className="text-button">Send reset link <Icon name="arrow-up" size={13} /></button></form>}
      {mode === 'sign-up' && <p className="auth-role-note"><Icon name="users" size={14} /> New accounts are created as Members. An Admin can assign additional roles.</p>}
      <small className="auth-note"><Icon name={client ? 'lock' : 'sparkle'} size={13} />{client ? 'Protected with Supabase authentication' : 'Authentication will be connected in the backend phase'}</small>
    </section></div>
  </main>;
}
