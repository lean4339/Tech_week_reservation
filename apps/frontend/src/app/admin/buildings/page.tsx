import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { BuildingManager } from '@/components/business/building-manager';

export default async function BuildingsPage() {
  const user = await requireUser('buildings:write');
  return (
    <WorkspaceShell
      user={user}
      title="Administrar edificios"
      section="buildings"
    >
      <BuildingManager />
    </WorkspaceShell>
  );
}
