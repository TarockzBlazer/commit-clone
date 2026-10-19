'use client';

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
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
      <div className="w-full max-w-md p-8 bg-[#232323] rounded-lg">
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setMode('login')}
            className={`px-4 py-2 rounded-t ${mode === 'login' ? 'bg-[#7289da] text-white' : 'bg-transparent text-gray-400'}`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('register')}
            className={`px-4 py-2 rounded-t ${mode === 'register' ? 'bg-[#7289da] text-white' : 'bg-transparent text-gray-400'}`}
          >
            Registrar
          </button>
        </div>
        {mode === 'login' ? <LoginPage /> : <RegisterPage />}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function Page() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <ProtectedApp />
      </WebSocketProvider>
    </AuthProvider>
  );
}