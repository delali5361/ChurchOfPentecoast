import { useState } from 'react';
import { BrandMark, Icon } from '../components/Icon';

export function LandingPage({ onSignIn, onSignUp, previewMode = false, onEnterPreview, onEnterAdminPreview }: {
  onSignIn?: () => void;
  onSignUp?: () => void;
  previewMode?: boolean;
  onEnterPreview?: () => void;
  onEnterAdminPreview?: () => void;
}) {
  const [authNotice, setAuthNotice] = useState('');
  const openSignIn = () => {
    if (onSignIn) onSignIn();
    else if (previewMode) setAuthNotice('Sign-in is a frontend preview until authentication is connected.');
  };
  const openSignUp = () => {
    if (onSignUp) onSignUp();
    else if (previewMode) setAuthNotice('Member sign-up is a frontend preview until authentication is connected.');
  };
  return <main className="landing-page">
    <header className="landing-header">
      <a className="landing-brand" href="#home" aria-label="Grace Assembly home"><BrandMark /><span>Grace Assembly</span></a>
      <nav aria-label="Public navigation">
        <a href="#ministries">Ministries</a>
        <a href="#community">Our community</a>
        <button className="button button-ghost" onClick={openSignIn}>Sign in</button>
        <button className="button button-primary" onClick={openSignUp}>Join the church <Icon name="arrow-up" size={15} /></button>
      </nav>
    </header>
    <section className="landing-hero" id="home">
      <div className="landing-copy">
        <span className="welcome-label"><Icon name="sparkle" size={14} /> ONE CHURCH. MANY WAYS TO CARE.</span>
        <h1>Grow in faith.<br /><em>Find your place.</em></h1>
        <p>Welcome to Grace Assembly — a church family growing together in worship, service, and care for one another.</p>
        <div className="landing-actions">
          <button className="button button-primary" onClick={openSignUp}>Create a member account <Icon name="arrow-up" size={15} /></button>
          <button className="button button-ghost" onClick={openSignIn}>Sign in to your workspace</button>
          {previewMode && <button className="button button-ghost" onClick={onEnterPreview}>Explore the preview workspace <Icon name="arrow-up" size={15} /></button>}
          {previewMode && onEnterAdminPreview && <button className="button button-ghost" onClick={onEnterAdminPreview}><Icon name="settings" size={15} /> Explore Admin preview</button>}
        </div>
        {authNotice && <p className="landing-auth-notice" role="status">{authNotice}</p>}
        <div className="landing-trust"><Icon name="shield" size={15} /><span>{previewMode
          ? 'Preview mode is available. Configure Supabase to enable secure sign-in and Member accounts.'
          : 'Every ministry has a role-appropriate space. Your account starts with Member access.'}</span></div>
      </div>
      <div className="landing-art" aria-hidden="true">
        <div className="landing-glass-orb"><BrandMark /></div>
        <span className="landing-orbit landing-orbit-a" /><span className="landing-orbit landing-orbit-b" />
        <span className="landing-spark landing-spark-a">✦</span><span className="landing-spark landing-spark-b">✧</span>
      </div>
    </section>
    <section className="landing-pillars" id="ministries" aria-label="Church life">
      <article><span><Icon name="users" size={20} /></span><h2>Belong</h2><p>Find your place in a welcoming church family.</p></article>
      <article><span><Icon name="network" size={20} /></span><h2>Serve</h2><p>Connect with ministries and use your gifts.</p></article>
      <article><span><Icon name="heart" size={20} /></span><h2>Grow</h2><p>Share in worship, fellowship, and care.</p></article>
    </section>
    <footer className="landing-footer" id="community"><BrandMark /><span>Grace Assembly · People first. Ministry together.</span></footer>
  </main>;
}
