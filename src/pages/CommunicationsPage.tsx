import { CommunicationsPageImpl } from './CommunicationsPageImpl';

export function CommunicationsPage({ onAction }: { onAction: (message: string) => void }) {
  return <CommunicationsPageImpl onAction={onAction} />;
}
