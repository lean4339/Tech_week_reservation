import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { RoomManager } from '@/components/business/room-manager';

export default async function AdminRoomsPage() {
  const user = await requireUser('rooms:write');
  return (
    <WorkspaceShell user={user} title="Administrar salas" section="rooms">
      <RoomManager />
    </WorkspaceShell>
  );
}
