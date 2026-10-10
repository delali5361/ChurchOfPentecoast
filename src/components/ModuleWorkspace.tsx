import { Icon } from './Icon';
import type { ModuleDefinition } from '../data/modules';

export function ModuleWorkspace({ definition, onAction }: { definition: ModuleDefinition; onAction: (message: string) => void }) {
  return <div className="module-workspace">
    <section className="module-intro glass-card">
      <div className="module-intro-copy"><span className="welcome-label"><Icon name="sparkle" size={14} /> {definition.eyebrow.toUpperCase()}</span>
        <h2>{definition.title}<br /><span>with room to grow.</span></h2><p>{definition.description}</p></div>
      <div className="module-intro-art"><div className="intro-orbit intro-orbit-one" /><div className="intro-orbit intro-orbit-two" /><span className="intro-icon"><Icon name={definition.features[0]?.icon ?? 'church'} size={38} strokeWidth={1.3} /></span></div>
    </section>
    <section className="module-summary-grid" aria-label={`${definition.title} overview`}>
      {definition.summaries.map((summary) => <article className={`module-summary tone-${summary.tone}`} key={summary.label}>
        <span className="summary-icon"><Icon name={summary.icon} size={18} /></span><span className="summary-label">{summary.label}</span>
        <strong>{summary.value}</strong><span className="summary-description">{summary.description}</span>
      </article>)}
    </section>
    <section className="workspace-panel glass-card">
      <div className="section-heading"><div><span className="eyebrow">A connected workspace</span><h2>Everything your team needs to get started</h2></div>
        <span className="phase-badge"><Icon name="sparkle" size={13} /> Workspace foundation</span></div>
      <div className="feature-grid">{definition.features.map((feature) =>
        <article className="feature-card" key={feature.title}><span className="feature-icon"><Icon name={feature.icon} size={19} /></span>
          <div><h3>{feature.title}</h3><p>{feature.description}</p></div></article>)}</div>
      <div className="phase-notice"><span className="notice-mark"><Icon name="arrow" size={16} /></span><div><strong>Coming next</strong><span>{definition.nextStep}</span></div></div>
      <button className="text-button workspace-help" onClick={() => onAction(`${definition.title} setup is being prepared for the next build phase.`)}>View setup checklist <Icon name="arrow-up" size={14} /></button>
    </section>
  </div>;
}
