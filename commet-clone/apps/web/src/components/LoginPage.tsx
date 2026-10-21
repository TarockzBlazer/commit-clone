'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="text-[var(--danger)] text-sm p-3 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg" role="alert">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="login-username" className="block text-sm font-medium mb-1">Usuário</label>
        <input
          id="login-username"
          data-testid="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] text-white placeholder:text-[var(--muted)]"
          required
          autoComplete="username"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium mb-1">Senha</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] text-white placeholder:text-[var(--muted)]"
          required
          autoComplete="current-password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="login-submit"
        className="w-full py-3 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}