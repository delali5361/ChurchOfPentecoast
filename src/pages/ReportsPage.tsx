import { ReportsPageImpl } from './ReportsPageImpl';

export function ReportsPage({ onAction }: { onAction: (message: string) => void }) {
  return <ReportsPageImpl onAction={onAction} />;
}
