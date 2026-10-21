'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const { register } = useAuth();
  const router = useRouter();

  const validateUsername = (value: string): string => {
    if (!value) return 'Usuário é obrigatório';
    if (value.length < 3) return 'Usuário deve ter pelo menos 3 caracteres';
    if (value.length > 20) return 'Usuário deve ter no máximo 20 caracteres';
    return '';
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    setUsernameError(validateUsername(value));
  };

  const handleUsernameBlur = () => {
    if (!username) {
      setUsernameError('Usuário é obrigatório');
    }
  };

  const isFormValid = username.length >= 3 && username.length <= 20 && email.trim() && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setError('');
    setLoading(true);
    try {
      await register(username, email, password);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar');
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
        <label htmlFor="register-username" className="block text-sm font-medium mb-1">Usuário</label>
        <input
          id="register-username"
          data-testid="register-username"
          type="text"
          value={username}
          onChange={handleUsernameChange}
          onBlur={handleUsernameBlur}
          className={`w-full px-4 py-3 bg-[var(--bg)] border rounded-lg focus:outline-none focus:ring-2 text-white placeholder:text-[var(--muted)] ${
            usernameError ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]/20' : 'border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-[var(--accent-muted)]'
          }`}
          required
          autoComplete="username"
          aria-invalid={!!usernameError}
          aria-describedby={usernameError ? 'username-error' : undefined}
        />
        {usernameError && (
          <p id="username-error" className="text-[var(--danger)] text-xs mt-1" role="alert">{usernameError}</p>
        )}
      </div>
      <div>
        <label htmlFor="register-email" className="block text-sm font-medium mb-1">Email</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] text-white placeholder:text-[var(--muted)]"
          required
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="register-password" className="block text-sm font-medium mb-1">Senha</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] text-white placeholder:text-[var(--muted)]"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !isFormValid}
        data-testid="register-submit"
        className="w-full py-3 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {loading ? 'Registrando...' : 'Registrar'}
      </button>
    </form>
  );
}