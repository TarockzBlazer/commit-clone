'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { api, Server, Channel, Message, User } from '@/lib/api';
import { VoiceChannel } from './VoiceChannel';

export function AppLayout() {
  const { user, logout, token } = useAuth();
  const { 
    connect, 
    joinChannel, 
    sendMessage, 
    onMessage, 
    onJoined, 
    connected,
    inVoiceChannel,
  } = useWebSocket();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) connect(token);
    loadServers();
  }, [token, connect]);

  useEffect(() => {
    if (selectedChannel) {
      if (selectedChannel.type === 'voice') {
        // For voice channels, don't join text chat or load messages
        setMessages([]);
        return;
      }
      
      loadMessages(selectedChannel.id);
      const unsubscribeMessage = onMessage((msg) => {
        if (msg.channelId === selectedChannel.id) {
          setMessages(prev => [...prev, msg]);
        }
      });
      const unsubscribeJoined = onJoined((channelId) => {
        console.log('Joined channel:', channelId);
      });
      joinChannel(selectedChannel.id);
      return () => {
        unsubscribeMessage();
        unsubscribeJoined();
      };
    }
  }, [selectedChannel, onMessage, onJoined, joinChannel]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadServers = async () => {
    try {
      const data = await api.servers.list();
      setServers(data);
      if (data.length > 0 && !selectedServer) {
        setSelectedServer(data[0]);
      }
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  };

  const loadChannels = async (serverId: string) => {
    try {
      const data = await api.channels.list(serverId);
      setChannels(data);
      if (data.length > 0) {
        setSelectedChannel(data[0]);
      } else {
        setSelectedChannel(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const data = await api.messages.list(channelId);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    setLoading(true);
    try {
      const server = await api.servers.create(newServerName);
      setServers(prev => [...prev, server]);
      setSelectedServer(server);
      setShowCreateServer(false);
      setNewServerName('');
    } catch (err) {
      console.error('Failed to create server:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!selectedServer || !newChannelName.trim()) return;
    setLoading(true);
    try {
      const channel = await api.channels.create(selectedServer.id, newChannelName, newChannelType);
      setChannels(prev => [...prev, channel]);
      setSelectedChannel(channel);
      setShowCreateChannel(false);
      setNewChannelName('');
    } catch (err) {
      console.error('Failed to create channel:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedChannel || !newMessage.trim()) return;
    const content = newMessage;
    setNewMessage('');
    try {
      await api.messages.create(selectedChannel.id, content);
      // Message will appear via WebSocket
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessage(content); // Restore on error
    }
  };

  const handleServerSelect = (server: Server) => {
    setSelectedServer(server);
    loadChannels(server.id);
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-white">
      {/* Server List */}
      <aside className="w-72 bg-[#181818] border-r border-[#2f2f2f] flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Commet</h1>
          <button
            onClick={() => setShowCreateServer(true)}
            className="p-2 rounded hover:bg-[#3a3a3a] transition-colors"
            title="Criar servidor"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {servers.map(server => (
            <li key={server.id}>
              <button
                onClick={() => handleServerSelect(server)}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                  selectedServer?.id === server.id ? 'bg-[#3a3a3a]' : 'hover:bg-[#2a2a2a]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#7289da] flex items-center justify-center font-bold">
                  {server.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{server.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-4 border-t border-[#2f2f2f] flex items-center justify-between">
          <span className="text-sm text-gray-400">{user?.username}</span>
          <button
            onClick={logout}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Channel List */}
      {selectedServer && (
        <aside className="w-64 bg-[#232323] border-r border-[#2f2f2f] flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <h2 className="font-semibold">{selectedServer.name}</h2>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="p-2 rounded hover:bg-[#3a3a3a] transition-colors"
              title="Criar canal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto px-2">
            {channels.map(channel => (
              <li key={channel.id}>
                <button
                  onClick={() => setSelectedChannel(channel)}
                  className={`w-full px-3 py-2 text-left rounded transition-colors flex items-center gap-2 ${
                    selectedChannel?.id === channel.id ? 'bg-[#3a3a3a]' : 'hover:bg-[#2a2a2a]'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {channel.type === 'text' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    )}
                  </svg>
                  <span className="text-sm">{channel.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedChannel ? (
          selectedChannel.type === 'voice' ? (
            <VoiceChannel channelId={selectedChannel.id} userId={user?.id || ''} />
          ) : (
            <>
              <header className="px-6 py-4 border-b border-[#2f2f2f] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="font-semibold">{selectedChannel.name}</span>
                </div>
                <span className="text-sm text-gray-400">
                  {connected ? '🟢 Conectado' : '🔴 Desconectado'}
                </span>
              </header>
              <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={messagesEndRef}>
                {messages.map(message => (
                  <div key={message.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#7289da] flex items-center justify-center font-bold flex-shrink-0">
                      {message.user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{message.user.username}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-300">{message.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <footer className="p-4 border-t border-[#2f2f2f]">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 px-4 py-2 bg-[#1a1a1a] border border-[#404040] rounded-full focus:outline-none focus:border-[#7289da]"
                    disabled={!selectedChannel}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || !selectedChannel}
                    className="px-6 py-2 bg-[#7289da] text-white rounded-full hover:bg-[#5b6eae] disabled:opacity-50 transition-colors"
                  >
                    Enviar
                  </button>
                </form>
              </footer>
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            {selectedServer ? 'Selecione um canal ou crie um novo' : 'Selecione um servidor'}
          </div>
        )}

        {/* Modals */}
        {showCreateServer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232323] rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Criar Servidor</h3>
              <input
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="Nome do servidor"
                className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#404040] rounded mb-4 focus:outline-none focus:border-[#7289da]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreateServer(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button onClick={handleCreateServer} disabled={loading || !newServerName.trim()} className="px-4 py-2 bg-[#7289da] text-white rounded hover:bg-[#5b6eae] disabled:opacity-50">
                  {loading ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreateChannel && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232323] rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Criar Canal</h3>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="Nome do canal"
                className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#404040] rounded mb-4 focus:outline-none focus:border-[#7289da]"
                autoFocus
              />
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Tipo</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="text"
                      checked={newChannelType === 'text'}
                      onChange={() => setNewChannelType('text')}
                      className="accent-[#7289da]"
                    />
                    <span>Texto</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="voice"
                      checked={newChannelType === 'voice'}
                      onChange={() => setNewChannelType('voice')}
                      className="accent-[#7289da]"
                    />
                    <span>Voz</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreateChannel(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button onClick={handleCreateChannel} disabled={loading || !newChannelName.trim()} className="px-4 py-2 bg-[#7289da] text-white rounded hover:bg-[#5b6eae] disabled:opacity-50">
                  {loading ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}