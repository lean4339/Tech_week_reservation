import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { WorkspaceShell } from '@/components/workspace-shell';
import { RoomExplorer } from '@/components/business/room-explorer';

export default async function DashboardPage() {
  const user = await requireUser('rooms:read');
  if (user.permissions.includes('reservations:manage')) redirect('/admin');
  return (
    <WorkspaceShell user={user} title="Salas y disponibilidad" section="rooms">
      <RoomExplorer />
    </WorkspaceShell>
  );
}
