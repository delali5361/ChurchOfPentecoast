import { AdministrationPageImpl } from './AdministrationPageImpl';

export function AdministrationPage({ onAction }: { onAction: (message: string) => void }) {
  return <AdministrationPageImpl onAction={onAction} />;
}
