'use client';

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WebSocketProvider, useWebSocket } from '@/context/WebSocketContext';
import { LoginPage } from '@/components/LoginPage';
import { RegisterPage } from '@/components/RegisterPage';
import { AppLayout } from '@/components/AppLayout';

function AuthInitializer() {
  const { token } = useAuth();
  const { connect } = useWebSocket();

  useEffect(() => {
    if (token) {
      connect(token);
    }
  }, [token, connect]);

  return null;
}

function ProtectedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--ink-secondary)]">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthChoice />;
  }

  return (
    <>
      <AuthInitializer />
      <AppLayout />
    </>
  );
}

function AuthChoice() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ code: string; serverName: string; serverId: string } | null>(null);

  const handleValidateInvite = async () => {
    if (!joinCode.trim()) return;
    setJoinError('');
    setValidatingInvite(true);
    try {
      const response = await fetch('http://localhost:4000/invites/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid invite code');
      }
      const inviteInfo = await response.json();
      setInviteInfo({ code: joinCode.trim().toUpperCase(), serverName: inviteInfo.serverName, serverId: inviteInfo.serverId });
      setShowJoinServer(false);
      // Store invite code for auto-join after login
      localStorage.setItem('pendingInviteCode', joinCode.trim().toUpperCase());
      localStorage.setItem('pendingInviteServerId', inviteInfo.serverId);
      // If user is already authenticated, accept the invite immediately
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await fetch('http://localhost:4000/invites/accept', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
            credentials: 'include',
          });
        } catch (err) {
          console.error('Failed to auto-join server:', err);
        }
      }
    } catch (err: any) {
      setJoinError(err.message || 'Invalid invite code');
    } finally {
      setValidatingInvite(false);
    }
  };

  const handleJoinServer = async () => {
    // This is now handled by validate + auto-join after login
    setShowJoinServer(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, var(--accent), #3b82f6)' }}>
            <span className="text-2xl font-bold text-white">C</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Commet</h1>
          <p className="text-[var(--muted)] mt-1">Entre para continuar</p>
        </div>

        {showJoinServer ? (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-semibold">Entrar no Servidor</h2>
              <button
                onClick={() => { setShowJoinServer(false); setJoinCode(''); setInviteInfo(null); }}
                className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
                aria-label="Fechar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-8">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Código do convite (ex: ABC123XY)"
                className="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded mb-4 focus:outline-none focus:border-[var(--accent)] text-uppercase"
                autoFocus
                maxLength={8}
              />
              {inviteInfo && (
                <div className="mb-4 p-3 bg-[var(--surface)] rounded-lg text-sm">
                  <p className="text-[var(--ink-secondary)] mb-1">Convite válido para:</p>
                  <p className="font-medium">{inviteInfo.serverName}</p>
                </div>
              )}
              {joinError && (
                <div className="text-[var(--danger)] text-sm mb-4" role="alert">{joinError}</div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowJoinServer(false); setJoinCode(''); setInviteInfo(null); }} className="px-4 py-2 text-[var(--ink-secondary)] hover:text-white">Cancelar</button>
                <button onClick={handleValidateInvite} disabled={validatingInvite || !joinCode.trim()} className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors">
                  {validatingInvite ? 'Validando...' : 'Validar e continuar'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="flex border-b border-[var(--border)]">
                <button
                  onClick={() => setMode('login')}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    mode === 'login'
                      ? 'bg-[var(--surface-active)] text-white border-b-2 border-[var(--accent)]'
                      : 'text-[var(--ink-secondary)] hover:text-white hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => setMode('register')}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    mode === 'register'
                      ? 'bg-[var(--surface-active)] text-white border-b-2 border-[var(--accent)]'
                      : 'text-[var(--ink-secondary)] hover:text-white hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  Registrar
                </button>
              </div>

              <div className="p-8">
                {mode === 'login' ? <LoginPage /> : <RegisterPage />}
              </div>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => setShowJoinServer(true)}
                className="w-full px-4 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)] hover:text-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Entrar via convite
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[var(--muted)] text-sm mt-6">
          Commet Clone &copy; 2025
        </p>
      </div>
    </div>
  );
}

const handleLoginSuccess = async () => {
  // Check for pending invite after successful login
  const pendingCode = localStorage.getItem('pendingInviteCode');
  const pendingServerId = localStorage.getItem('pendingInviteServerId');
  const token = localStorage.getItem('token');
  if (pendingCode && pendingServerId && token) {
    localStorage.removeItem('pendingInviteCode');
    localStorage.removeItem('pendingInviteServerId');
    try {
      await fetch('http://localhost:4000/invites/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: pendingCode }),
        credentials: 'include',
      });
    } catch (err) {
      console.error('Failed to auto-join server:', err);
    }
  };
}

export default function Page() {
  return (
    <AuthProvider onAuthSuccess={handleLoginSuccess}>
      <WebSocketProvider>
        <ProtectedApp />
      </WebSocketProvider>
    </AuthProvider>
  );
}