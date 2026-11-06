'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'tech-week-web',
        },
        body: '{}',
      });
      if (!response.ok) throw new Error('Logout failed');
      router.replace('/login');
      router.refresh();
    } catch {
      setError('No se pudo cerrar la sesión. Volvé a intentarlo.');
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="secondary" onClick={logout} disabled={busy}>
        {busy ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
