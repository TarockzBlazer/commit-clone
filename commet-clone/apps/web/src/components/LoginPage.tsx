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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div>
        <label className="block text-sm font-medium mb-1">Usuário</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#404040] rounded focus:outline-none focus:border-[#7289da]"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#404040] rounded focus:outline-none focus:border-[#7289da]"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-[#7289da] text-white rounded hover:bg-[#5b6eae] disabled:opacity-50"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}