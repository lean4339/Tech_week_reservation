import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LogoutButton } from '@/components/logout-button';

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <main className="workspace">
      <header>
        <Link href="/dashboard" className="brand">
          Tech Week Reservation
        </Link>
        <LogoutButton />
      </header>
      <section className="card">
        <p className="eyebrow">MI CUENTA</p>
        <h1>Hola, {user.email}</h1>
        <p>Tu sesión está activa.</p>
        <p>
          Perfil:{' '}
          <strong>{user.role === 'admin' ? 'Administrador' : 'Usuario'}</strong>
        </p>
        {user.permissions.includes('admin:read') && (
          <Link className="action-link" href="/admin">
            Abrir administración →
          </Link>
        )}
      </section>
    </main>
  );
}
