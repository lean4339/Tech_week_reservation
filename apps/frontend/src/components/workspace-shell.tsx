import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CurrentUser } from '@/lib/auth';
import { LogoutButton } from './logout-button';

export function WorkspaceShell({
  user,
  title,
  section,
  children,
}: {
  user: CurrentUser;
  title: string;
  section: 'rooms' | 'reservations' | 'activity' | 'buildings';
  children: ReactNode;
}) {
  const admin = user.permissions.includes('reservations:manage');
  const links = admin
    ? [
        { href: '/admin', label: 'Agenda de reservas', key: 'reservations' },
        {
          href: '/admin/buildings',
          label: 'Administrar edificios',
          key: 'buildings',
        },
        { href: '/admin/rooms', label: 'Administrar salas', key: 'rooms' },
        { href: '/admin/activity', label: 'Actividad', key: 'activity' },
      ]
    : [
        { href: '/dashboard', label: 'Salas y disponibilidad', key: 'rooms' },
        { href: '/reservations', label: 'Mis reservas', key: 'reservations' },
      ];
  return (
    <main className="workspace">
      <header>
        <Link href={admin ? '/admin' : '/dashboard'} className="brand">
          Tech Week Reservation
        </Link>
        <LogoutButton />
      </header>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            {admin ? 'ADMINISTRACIÓN' : (user.businessName ?? 'MI ESPACIO')}
          </p>
          <h1>{title}</h1>
        </div>
        <span className="muted account-name">{user.email}</span>
      </div>
      <nav className="workspace-nav" aria-label="Gestión de reservas">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            aria-current={section === link.key ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
