'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWebSocket } from '@/context/WebSocketContext';
import { api, Server, Channel, Message, User, Invite } from '@/lib/api';
import { VoiceChannel } from './VoiceChannel';

interface VoiceParticipant {
  userId: string;
  username: string;
}

const SELECTED_SERVER_KEY = 'commet-selected-server-id';
const SELECTED_CHANNEL_KEY = 'commet-selected-channel-id';

export function AppLayout() {
  const { user, logout, token } = useAuth();
  const { 
    connect, 
    joinChannel, 
    sendMessage, 
    broadcastNewMessage,
    onMessage, 
    onJoined, 
    onVoiceJoined,
    onVoiceLeft,
    onVoiceUserJoined,
    onVoiceUserLeft,
    joinVoice,
    connected,
    inVoiceChannel,
  } = useWebSocket();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [restoredSelection, setRestoredSelection] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [loading, setLoading] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [serversSidebarOpen, setServersSidebarOpen] = useState(false);
  const [channelsSidebarOpen, setChannelsSidebarOpen] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [inviteError, setInviteError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) connect(token);
    loadServers();
  }, [token, connect]);

  // Restore saved server/channel selection after servers are loaded
  useEffect(() => {
    if (!restoredSelection && servers.length > 0) {
      const savedServerId = localStorage.getItem(SELECTED_SERVER_KEY);
      const savedChannelId = localStorage.getItem(SELECTED_CHANNEL_KEY);

      if (savedServerId) {
        const server = servers.find(s => s.id === savedServerId);
        if (server) {
          setSelectedServer(server);
          loadChannels(server.id, true);

          // After channels load, restore channel selection
          if (savedChannelId) {
            const channelCheck = setInterval(() => {
              // Check the local channels state instead of server.channels
              const savedChannel = channels.find(c => c.id === savedChannelId);
              if (savedChannel) {
                clearInterval(channelCheck);
                setSelectedChannel(savedChannel);
              }
            }, 100);

            // Fallback: clear interval after 5 seconds
            setTimeout(() => clearInterval(channelCheck), 5000);
          }
        }
      }
      setRestoredSelection(true);
    }
  }, [servers, restoredSelection, channels]);

  useEffect(() => {
    if (selectedChannel) {
      if (selectedChannel.type === 'voice') {
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

  // Voice presence events
  useEffect(() => {
    const unsubJoined = onVoiceJoined((data) => {
      if (data.channelId === selectedChannel?.id) {
        setVoiceParticipants(data.participants);
      }
    });
    const unsubLeft = onVoiceLeft((data) => {
      if (data.channelId === selectedChannel?.id) {
        setVoiceParticipants([]);
      }
    });
    const unsubUserJoined = onVoiceUserJoined((data) => {
      setVoiceParticipants(prev => [...prev, data]);
    });
    const unsubUserLeft = onVoiceUserLeft((data) => {
      setVoiceParticipants(prev => prev.filter(p => p.userId !== data.userId));
    });
    return () => {
      unsubJoined();
      unsubLeft();
      unsubUserJoined();
      unsubUserLeft();
    };
  }, [onVoiceJoined, onVoiceLeft, onVoiceUserJoined, onVoiceUserLeft, selectedChannel?.id]);

  // Close members panel when server changes
  useEffect(() => {
    if (selectedServer) {
      setShowMembersPanel(false);
    }
  }, [selectedServer]);

  // Close mobile sidebars on channel select
  useEffect(() => {
    if (selectedChannel) {
      setChannelsSidebarOpen(false);
      setServersSidebarOpen(false);
    }
  }, [selectedChannel]);

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

  const loadChannels = async (serverId: string, skipAutoSelect = false) => {
    try {
      const data = await api.channels.list(serverId);
      setChannels(data);
      if (data.length > 0 && !skipAutoSelect) {
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

  const handleCreateInvite = async () => {
    if (!selectedServer) return;
    setInviteError('');
    setLoading(true);
    try {
      const invite = await api.servers.createInvite(selectedServer.id);
      setCreatedInvite(invite);
      setShowCreateInvite(true);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinServer = async () => {
    if (!joinCode.trim()) return;
    setInviteError('');
    setLoading(true);
    try {
      const server = await api.invites.accept(joinCode.trim());
      setServers(prev => [...prev, server]);
      setSelectedServer(server);
      setShowJoinServer(false);
      setJoinCode('');
    } catch (err: any) {
      setInviteError(err.message || 'Failed to join server');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!createdInvite) return;
    const link = `${window.location.origin}/invites/${createdInvite.code}`;
    await navigator.clipboard.writeText(link);
    setInviteError('Invite link copied!');
    setTimeout(() => setInviteError(''), 2000);
  };

const handleSendMessage = async () => {
    if (!selectedChannel || !newMessage.trim()) return;
    const content = newMessage;
    setNewMessage('');
    try {
      // Persist via REST API first (single source of truth)
      const message = await api.messages.create(selectedChannel.id, content);
      // Add to local list immediately so the sender sees it
      setMessages(prev => [...prev, message]);
      // Broadcast to other clients via Socket.IO (no DB write on gateway)
      broadcastNewMessage(message);
    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMessage(content);
    }
  };

  const handleServerSelect = (server: Server) => {
    setSelectedServer(server);
    localStorage.setItem(SELECTED_SERVER_KEY, server.id);
    localStorage.removeItem(SELECTED_CHANNEL_KEY); // Clear saved channel when switching servers
    loadChannels(server.id, false);
    setServersSidebarOpen(false);
  };

const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.shiftKey) {
            handleSendMessage();
        }
    }
};

  const handleJoinFirstVoiceChannel = useCallback(() => {
    const voiceChannel = channels.find(c => c.type === 'voice');
    if (voiceChannel) {
      setSelectedChannel(voiceChannel);
      setChannelsSidebarOpen(false);
    }
  }, [channels]);

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--ink)] overflow-hidden">
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${serversSidebarOpen || channelsSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => { setServersSidebarOpen(false); setChannelsSidebarOpen(false); }}
        aria-hidden="true"
      />

      {/* Server Sidebar */}
      <aside
        className={`w-72 bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col lg:relative fixed lg:static inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out ${serversSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        role="navigation"
        aria-label="Servidores"
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border)]">
          <h1 className="text-xl font-bold text-white">Commet</h1>
          <button
            data-testid="btn-create-server"
            onClick={() => setShowCreateServer(true)}
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
            title="Criar servidor"
            aria-label="Criar servidor"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-1" role="listbox" aria-label="Lista de servidores">
          {servers.map(server => (
            <li key={server.id} role="option" aria-selected={selectedServer?.id === server.id}>
              <button
                onClick={() => handleServerSelect(server)}
                className={`server-item w-full px-4 py-3 text-left flex items-center gap-3 transition-colors rounded-lg ${
                  selectedServer?.id === server.id
                    ? 'bg-[var(--surface-active)]'
                    : 'hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white">
                  {server.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium truncate">{server.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-4 border-t border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0">
              {user?.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-xs text-[var(--muted)] truncate">@{user?.username?.toLowerCase()}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
            title="Configurações"
            aria-label="Configurações do usuário"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.348 0l1.708 3.216a1 1 0 001.286 1.195l3.265.492c1.08.161 1.878 1.232 1.615 2.298l-.628 3.41a1 1 0 01-.747 1.495l-2.19 2.19a1 1 0 00-.235 1.423l.49 3.52a1 1 0 01-.487 1.304l-.997 1.86a1 1 0 01-1.341.814L9.5 23.5a1 1 0 01-1.797-.414l-1.86-.997a1 1 0 01-.488-1.304l.49-3.52a1 1 0 00-.235-1.423L4.93 9.43a1 1 0 00-.748-1.495l-.628-3.41c-.348-1.066.45-2.132 1.616-2.298l3.265-.492a1 1 0 011.286-1.195l1.708-3.216z"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Channel Sidebar */}
      {selectedServer && (
        <aside
          className={`w-64 bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col lg:relative fixed lg:static inset-y-0 left-72 z-50 transform transition-transform duration-200 ease-out ${channelsSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          role="navigation"
          aria-label="Canais"
        >
          <div className="p-4 flex items-center justify-between border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white lg:hidden"
                onClick={() => setServersSidebarOpen(true)}
                aria-label="Abrir servidores"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              </button>
              <h2 className="font-semibold truncate">{selectedServer.name}</h2>
            </div>
            <button
              data-testid="btn-create-channel"
              onClick={() => setShowCreateChannel(true)}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
              title="Criar canal"
              aria-label="Criar canal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              data-testid="btn-create-invite"
              onClick={handleCreateInvite}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
              title="Convidar membros"
              aria-label="Convidar membros"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Canais do servidor">
            {/* Text Channels */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                <span>CANAIS DE TEXTO</span>
              </div>
            </div>
            <ul role="listbox" aria-label="Canais de texto" className="space-y-0.5">
              {textChannels.map(channel => (
                <li key={channel.id} role="option" aria-selected={selectedChannel?.id === channel.id}>
                  <button
                    data-testid={`channel-${channel.name}`}
                    onClick={() => {
                      setSelectedChannel(channel);
                      localStorage.setItem(SELECTED_CHANNEL_KEY, channel.id);
                      joinChannel(channel.id);
                      setChannelsSidebarOpen(false);
                    }}
                    className={`channel-item w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center gap-2 text-sm ${
                      selectedChannel?.id === channel.id
                        ? 'bg-[var(--surface-active)] text-white'
                        : 'hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)]'
                    }`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <span className="truncate font-medium">#{channel.name}</span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Voice Channels */}
            {voiceChannels.length > 0 && (
              <>
                <div className="px-3 py-2 mt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                    <svg className="w-4 h-4 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                    </svg>
                    <span>CANAIS DE VOZ</span>
                  </div>
                </div>
                <ul role="listbox" aria-label="Canais de voz" className="space-y-0.5">
                  {voiceChannels.map(channel => (
                    <li key={channel.id} role="option" aria-selected={selectedChannel?.id === channel.id}>
                      <button
                        data-testid={`channel-${channel.name}`}
                        onClick={() => {
                          setSelectedChannel(channel);
                          localStorage.setItem(SELECTED_CHANNEL_KEY, channel.id);
                          joinVoice(channel.id);
                          setChannelsSidebarOpen(false);
                        }}
                        className={`channel-item w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center gap-2 text-sm ${
                          selectedChannel?.id === channel.id
                            ? 'bg-[var(--surface-active)] text-white'
                            : 'hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)]'
                        }`}
                      >
                        <svg className="w-5 h-5 flex-shrink-0 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                        </svg>
                        <span className="truncate font-medium">{channel.name}</span>
                        <span className="ml-auto flex items-center gap-1 text-xs text-[var(--success)]">
                          <span className={`w-1.5 h-1.5 rounded-full ${inVoiceChannel === channel.id ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--muted)]'}`} aria-hidden="true" />
                          <span className="sr-only">{inVoiceChannel === channel.id ? 'Conectado' : 'Desconectado'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>

          <div className="p-3 border-t border-[var(--border)]">
            <button
              data-testid="btn-create-voice-channel"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-secondary)] hover:text-white transition-colors"
              onClick={() => { setNewChannelType('voice'); setShowCreateChannel(true); }}
              aria-label="Criar canal de voz"
            >
              <svg className="w-5 h-5 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              <span>Criar canal de voz</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 lg:relative">
        {selectedChannel ? (
          selectedChannel.type === 'voice' ? (
            <VoiceChannel channelId={selectedChannel.id} userId={user?.id || ''} />
          ) : (
            <>
              {/* Channel Header */}
              <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-card)] flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white lg:hidden"
                    onClick={() => setChannelsSidebarOpen(true)}
                    aria-label="Abrir canais"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                  </button>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[var(--muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <span className="font-semibold truncate">#{selectedChannel.name}</span>
                    <span className="px-2 py-0.5 text-xs bg-[var(--surface)] rounded text-[var(--muted)]">texto</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
                    title="Fixar mensagens"
                    aria-label="Fixar mensagens"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4"/>
                    </svg>
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
                    onClick={() => setShowMembersPanel(!showMembersPanel)}
                    title="Membros"
                    aria-label="Membros do canal"
                    aria-expanded={showMembersPanel}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                    </svg>
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
                    title="Configurações do canal"
                    aria-label="Configurações do canal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.348 0l1.708 3.216a1 1 0 001.286 1.195l3.265.492c1.08.161 1.878 1.232 1.615 2.298l-.628 3.41a1 1 0 01-.747 1.495l-2.19 2.19a1 1 0 00-.235 1.423l.49 3.52a1 1 0 01-.487 1.304l-.997 1.86a1 1 0 01-1.341.814L9.5 23.5a1 1 0 01-1.797-.414l-1.86-.997a1 1 0 01-.488-1.304l.49-3.52a1 1 0 00-.235-1.423L4.93 9.43a1 1 0 00-.748-1.495l-.628-3.41c-.348-1.066.45-2.132 1.616-2.298l3.265-.492a1 1 0 011.286-1.195l1.708-3.216z"/>
                    </svg>
                  </button>
                </div>
              </header>

              {/* Messages Area */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                role="log"
                aria-live="polite"
                aria-label={`Mensagens do canal #${selectedChannel.name}`}
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <svg className="w-16 h-16 text-[var(--muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <h3 className="text-lg font-semibold text-[var(--ink-secondary)] mb-1">Nenhuma mensagem ainda</h3>
                    <p className="text-[var(--muted)]">Seja o primeiro a enviar uma mensagem em <strong>#{selectedChannel.name}</strong></p>
                  </div>
                ) : (
                  <>
                    {messages.map(message => (
                      <MessageItem key={message.id} message={message} currentUserId={user?.id} />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message Input */}
              <footer className="p-3 border-t border-[var(--border)] bg-[var(--bg-card)] flex-shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white flex-shrink-0"
                    aria-label="Anexar arquivo"
                    title="Anexar arquivo"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white flex-shrink-0"
                    aria-label="Adicionar emoji"
                    title="Emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white flex-shrink-0"
                    aria-label="Formatar texto"
                    title="Formatar"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </button>
                  <div className="relative flex-1 min-w-0">
                    <input
                      data-testid="message-input"
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Digite uma mensagem..."
                      className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-strong)] rounded-full focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] text-white placeholder:text-[var(--muted)] pr-14"
                      disabled={!selectedChannel}
                      aria-label="Mensagem"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="message-send"
                    disabled={!newMessage.trim() || !selectedChannel}
                    className="p-3 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    aria-label="Enviar mensagem"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                  </button>
                </form>
              </footer>
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
            {selectedServer ? 'Selecione um canal ou crie um novo' : 'Selecione um servidor'}
          </div>
        )}

        {/* Modals */}
        {showCreateServer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateServer(false)}>
            <div className="bg-[var(--bg-card)] rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
               <h3 className="text-lg font-semibold mb-4">Criar Servidor</h3>
               <input
                 data-testid="input-server-name"
                 type="text"
                 value={newServerName}
                 onChange={(e) => setNewServerName(e.target.value)}
                 placeholder="Nome do servidor"
                 className="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded mb-4 focus:outline-none focus:border-[var(--accent)]"
                 autoFocus
               />
               <div className="flex justify-end gap-2">
                 <button onClick={() => setShowCreateServer(false)} className="px-4 py-2 text-[var(--ink-secondary)] hover:text-white">Cancelar</button>
                 <button data-testid="btn-confirm-create-server" onClick={handleCreateServer} disabled={loading || !newServerName.trim()} className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
                   {loading ? 'Criando...' : 'Criar servidor'}
                 </button>
               </div>
            </div>
          </div>
        )}

        {showCreateChannel && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateChannel(false)}>
            <div className="bg-[var(--bg-card)] rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Criar Canal</h3>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="Nome do canal"
                className="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded mb-4 focus:outline-none focus:border-[var(--accent)]"
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
                      className="accent-[var(--accent)]"
                    />
                    <span>Texto</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="voice"
                      checked={newChannelType === 'voice'}
                      onChange={() => setNewChannelType('voice')}
                      className="accent-[var(--accent)]"
                    />
                    <span>Voz</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreateChannel(false)} className="px-4 py-2 text-[var(--ink-secondary)] hover:text-white">Cancelar</button>
                <button onClick={handleCreateChannel} disabled={loading || !newChannelName.trim()} className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
                  {loading ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Invite Modal */}
        {showCreateInvite && createdInvite && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateInvite(false)}>
            <div className="bg-[var(--bg-card)] rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Convite Criado</h3>
              <div className="mb-4">
                <p className="text-sm text-[var(--ink-secondary)] mb-2">Compartilhe este link para convidar alguém:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/invites/${createdInvite.code}`}
                    className="flex-1 px-4 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded focus:outline-none text-sm"
                  />
                  <button
                    onClick={handleCopyInviteLink}
                    className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <div className="text-xs text-[var(--muted)] mb-4">
                <p>Expira em: {createdInvite.expiresAt ? new Date(createdInvite.expiresAt).toLocaleString() : 'Nunca'}</p>
                <p>Usos: {createdInvite.currentUses}/{createdInvite.maxUses}</p>
              </div>
              {inviteError && (
                <div className="text-[var(--danger)] text-sm mb-4" role="alert">{inviteError}</div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowCreateInvite(false); setCreatedInvite(null); }} className="px-4 py-2 text-[var(--ink-secondary)] hover:text-white">Fechar</button>
              </div>
            </div>
          </div>
        )}

        {/* Join Server Modal */}
        {showJoinServer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowJoinServer(false); setJoinCode(''); setInviteError(''); }}>
            <div className="bg-[var(--bg-card)] rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Entrar no Servidor</h3>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Código do convite (ex: ABC123XY)"
                className="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border-strong)] rounded mb-4 focus:outline-none focus:border-[var(--accent)] text-uppercase"
                autoFocus
                maxLength={8}
              />
              {inviteError && (
                <div className="text-[var(--danger)] text-sm mb-4" role="alert">{inviteError}</div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowJoinServer(false); setJoinCode(''); setInviteError(''); }} className="px-4 py-2 text-[var(--ink-secondary)] hover:text-white">Cancelar</button>
                <button onClick={handleJoinServer} disabled={loading || !joinCode.trim()} className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Members Panel (Right Sidebar) */}
      <aside
        id="membersPanel"
        className={`w-64 bg-[var(--bg-card)] border-l border-[var(--border)] flex flex-col hidden lg:flex transition-all duration-200 ${!showMembersPanel ? 'translate-x-full' : 'translate-x-0'}`}
        role="complementary"
        aria-label="Membros do canal"
        aria-hidden={!showMembersPanel}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-semibold">Membros <span className="text-xs text-[var(--muted)] font-normal">({selectedServer?.members?.length || 0})</span></h3>
          <button
            className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--ink-secondary)] hover:text-white"
            onClick={() => setShowMembersPanel(false)}
            aria-label="Fechar painel de membros"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Lista de membros">
          {(() => {
            const allMembers = selectedServer?.members || [];
            const onlineMembers = allMembers.filter(m => m.user && !m.user.username.includes('Bot'));
            const offlineMembers = allMembers.filter(m => m.user && m.user.username.includes('Bot'));

            return [
              onlineMembers.length > 0 && (
                <>
                  <div className="px-2 py-1">
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">ONLINE</p>
                  </div>
                  <ul role="list" className="space-y-0.5">
                    {onlineMembers.map(member => {
                      const inVoice = voiceParticipants.some(vp => vp.userId === member.userId);
                      return (
                        <li key={member.id} className="participant-item flex items-center gap-3 p-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent), #3b82f6)' }}>
                            {member.user?.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{member.user?.username}</p>
                            <p className="text-xs text-[var(--muted)] truncate">{member.role === 'owner' ? 'Proprietário' : member.role === 'admin' ? 'Administrador' : 'Membro'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${inVoice ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--success)]'}`} aria-label={inVoice ? 'Em chamada de voz' : 'Online'} />
                            <span className="text-xs text-[var(--success)] font-medium">{inVoice ? '🎧' : '●'}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ),
              offlineMembers.length > 0 && (
                <>
                  <div className="px-2 py-1 mt-2">
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">OFFLINE</p>
                  </div>
                  <ul role="list" className="space-y-0.5">
                    {offlineMembers.map(member => (
                      <li key={member.id} className="participant-item flex items-center gap-3 p-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors opacity-50">
                        <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center font-bold text-white flex-shrink-0">
                          {member.user?.username?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{member.user?.username}</p>
                          <p className="text-xs text-[var(--muted)] truncate">Bot do servidor</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[var(--muted)]" aria-label="Offline" />
                          <span className="text-xs text-[var(--muted)] font-medium">○</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ),
            ];
          })()}
        </nav>

        {/* Voice Channel Quick Join */}
        {selectedServer && voiceChannels.length > 0 && (
          <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)]">
            <button
              onClick={handleJoinFirstVoiceChannel}
              className="w-full flex items-center gap-3 p-3 bg-[var(--bg)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-left"
              aria-label={`Entrar no canal de voz ${voiceChannels[0].name}`}
            >
              <svg className="w-6 h-6 text-[var(--success)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Entrar no canal de voz</p>
                <p className="text-xs text-[var(--muted)] truncate">{voiceChannels[0].name}</p>
              </div>
              <svg className="w-5 h-5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        )}

        <div className="p-3 border-t border-[var(--border)]">
          <p className="text-[10px] leading-tight text-[var(--muted)] text-center">
            Projeto experimental, sem afiliação com Commet, Discord ou qualquer outra empresa.
          </p>
        </div>
      </aside>
    </div>
  );
}

// Separate MessageItem component for cleaner code
function MessageItem({ message, currentUserId }: { message: Message; currentUserId?: string }) {
  const isOwn = message.userId === currentUserId;
  const avatarColors = [
    'linear-gradient(135deg, var(--accent), #3b82f6)',
    'linear-gradient(135deg, var(--success), #22c55e)',
    'linear-gradient(135deg, var(--warning), #fbbf24)',
    'linear-gradient(135deg, var(--danger), #ef4444)',
    'linear-gradient(135deg, #8b5cf6, #a855f7)',
    'linear-gradient(135deg, #ec4899, #f472b6)',
  ];
  const colorIndex = message.user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % avatarColors.length;

  return (
    <div data-testid={`message-${message.id}`} className="flex gap-3 message-bubble" data-animation="slide-up" style={{ opacity: 0, transform: 'translateY(10px)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 message-avatar" style={{ background: avatarColors[colorIndex] }}>
        {message.user.username.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{message.user.username}</span>
          <span className="text-xs text-[var(--muted)]">
            {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isOwn && (
            <span className="text-xs px-1.5 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] rounded">Você</span>
          )}
        </div>
        <p className="text-[var(--ink-secondary)] break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}