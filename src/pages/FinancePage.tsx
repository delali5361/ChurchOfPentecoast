import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function FinancePage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.finance;
  return definition ? <ModulePage page="finance" definition={definition} onAction={onAction} /> : null;
}
