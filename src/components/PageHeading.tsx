import { Icon } from './Icon';
import type { PageId } from '../types';
import { pageSections } from '../navigation';

export function PageHeading({ page, action, onAction }: { page: PageId; action?: string; onAction?: () => void }) {
  const item = pageSections.flatMap((section) => section.items).find((entry) => entry.id === page);
  return <section className="page-heading">
    <div><div className="eyebrow"><span className="live-dot" /> {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <h1>{item?.label ?? 'Overview'}</h1><p>{item?.description ?? 'Your church at a glance'}</p></div>
    {action && onAction && <div className="heading-actions"><button className="button button-primary" onClick={onAction}><Icon name="plus" size={16} /> {action}</button></div>}
  </section>;
}
