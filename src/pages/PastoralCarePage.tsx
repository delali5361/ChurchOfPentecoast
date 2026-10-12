import { PastoralCarePageImpl } from './PastoralCarePageImpl';

export function PastoralCarePage({ onAction }: { onAction: (message: string) => void }) {
  return <PastoralCarePageImpl onAction={onAction} />;
}
