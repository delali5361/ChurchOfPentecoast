import { ModulePage } from './ModulePage';
import { moduleDefinitions } from '../data/modules';

export function AdministrationPage({ onAction }: { onAction: (message: string) => void }) {
  const definition = moduleDefinitions.administration;
  return definition ? <ModulePage page="administration" definition={definition} onAction={onAction} /> : null;
}
