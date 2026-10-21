'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '@/lib/api';

interface VoiceParticipant {
  userId: string;
  username: string;
}

interface WebSocketContextType {
  socket: Socket | null;
  connect: (token: string) => void;
  disconnect: () => void;
  joinChannel: (channelId: string) => void;
  sendMessage: (channelId: string, content: string) => void;
  broadcastNewMessage: (message: Message) => void;
  onMessage: (callback: (message: Message) => void) => () => void;
  onJoined: (callback: (channelId: string) => void) => () => void;
  joinVoice: (channelId: string) => void;
  leaveVoice: (channelId: string) => void;
  onVoiceJoined: (callback: (data: { channelId: string; participants: VoiceParticipant[] }) => void) => () => void;
  onVoiceLeft: (callback: (data: { channelId: string }) => void) => () => void;
  onVoiceUserJoined: (callback: (data: { userId: string; username: string }) => void) => () => void;
  onVoiceUserLeft: (callback: (data: { userId: string; username: string }) => void) => () => void;
  onVoiceOffer: (callback: (data: { fromUserId: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => void) => () => void;
  onVoiceAnswer: (callback: (data: { fromUserId: string; fromUsername: string; answer: RTCSessionDescriptionInit }) => void) => () => void;
  onVoiceIceCandidate: (callback: (data: { fromUserId: string; fromUsername: string; candidate: RTCIceCandidateInit }) => void) => () => void;
  sendVoiceOffer: (channelId: string, targetUserId: string, offer: RTCSessionDescriptionInit) => void;
  sendVoiceAnswer: (channelId: string, targetUserId: string, answer: RTCSessionDescriptionInit) => void;
  sendVoiceIceCandidate: (channelId: string, targetUserId: string, candidate: RTCIceCandidateInit) => void;
  connected: boolean;
  inVoiceChannel: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [inVoiceChannel, setInVoiceChannel] = useState<string | null>(null);
  const messageCallbacks = useRef<Set<(message: Message) => void>>(new Set());
  const joinedCallbacks = useRef<Set<(channelId: string) => void>>(new Set());
  const voiceJoinedCallbacks = useRef<Set<(data: { channelId: string; participants: VoiceParticipant[] }) => void>>(new Set());
  const voiceLeftCallbacks = useRef<Set<(data: { channelId: string }) => void>>(new Set());
  const voiceUserJoinedCallbacks = useRef<Set<(data: { userId: string; username: string }) => void>>(new Set());
  const voiceUserLeftCallbacks = useRef<Set<(data: { userId: string; username: string }) => void>>(new Set());
  const voiceOfferCallbacks = useRef<Set<(data: { fromUserId: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => void>>(new Set());
  const voiceAnswerCallbacks = useRef<Set<(data: { fromUserId: string; fromUsername: string; answer: RTCSessionDescriptionInit }) => void>>(new Set());
  const voiceIceCandidateCallbacks = useRef<Set<(data: { fromUserId: string; fromUsername: string; candidate: RTCIceCandidateInit }) => void>>(new Set());
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const inVoiceChannelRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isConnectingRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const pendingChannelJoinRef = useRef<string | null>(null);

  inVoiceChannelRef.current = inVoiceChannel;
  socketRef.current = socket;

  const cleanup = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    const currentSocket = socketRef.current;
    if (currentSocket) {
      currentSocket.off('connect');
      currentSocket.off('disconnect');
      currentSocket.off('connect_error');
      currentSocket.off('new_message');
      currentSocket.off('joined');
      currentSocket.off('voice_joined');
      currentSocket.off('voice_left');
      currentSocket.off('voice_user_joined');
      currentSocket.off('voice_user_left');
      currentSocket.off('voice_offer');
      currentSocket.off('voice_answer');
      currentSocket.off('voice_ice_candidate');
      currentSocket.disconnect();
    }
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
    setInVoiceChannel(null);
    inVoiceChannelRef.current = null;
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback((token: string) => {
    if (isConnectingRef.current) {
      console.log('[WS] Connection already in progress, skipping');
      return;
    }
    if (socketRef.current?.connected) {
      console.log('[WS] Already connected, skipping');
      return;
    }

    isConnectingRef.current = true;
    tokenRef.current = token;
    cleanup();

    const ws = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false, // We handle reconnection manually
    });

    ws.on('connect', () => {
      isConnectingRef.current = false;
      socketRef.current = ws;
      setSocket(ws);
      setConnected(true);
      console.log('[WS] Connected');

      // Execute any pending channel join
      if (pendingChannelJoinRef.current) {
        ws.emit('join_channel', pendingChannelJoinRef.current);
        pendingChannelJoinRef.current = null;
      }
    });

    ws.on('disconnect', (reason) => {
      isConnectingRef.current = false;
      const wasConnected = connected;
      setConnected(false);
      setInVoiceChannel(null);
      inVoiceChannelRef.current = null;
      socketRef.current = null;
      setSocket(null);
      // Clear any pending channel join on disconnect
      pendingChannelJoinRef.current = null;
      console.log('[WS] Disconnected, reason:', reason, 'was connected:', wasConnected);

      if (wasConnected && reason !== 'io client disconnect') {
        reconnectTimeout.current = setTimeout(() => {
          const storedToken = tokenRef.current || localStorage.getItem('token');
          if (storedToken && !isConnectingRef.current) {
            connect(storedToken);
          }
        }, 3000);
      }
    });

    ws.on('connect_error', (error) => {
      isConnectingRef.current = false;
      console.error('[WS] Connection error:', error.message);
    });

    ws.on('new_message', (data: Message) => {
      messageCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('joined', (data: { channelId: string }) => {
      joinedCallbacks.current.forEach(cb => cb(data.channelId));
    });

    ws.on('voice_joined', (data: { channelId: string; participants: VoiceParticipant[] }) => {
      setInVoiceChannel(data.channelId);
      inVoiceChannelRef.current = data.channelId;
      voiceJoinedCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_left', (data: { channelId: string }) => {
      const currentChannel = inVoiceChannelRef.current;
      if (currentChannel === data.channelId) {
        setInVoiceChannel(null);
        inVoiceChannelRef.current = null;
      }
      voiceLeftCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_user_joined', (data: { userId: string; username: string }) => {
      voiceUserJoinedCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_user_left', (data: { userId: string; username: string }) => {
      voiceUserLeftCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_offer', (data: { fromUserId: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => {
      voiceOfferCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_answer', (data: { fromUserId: string; fromUsername: string; answer: RTCSessionDescriptionInit }) => {
      voiceAnswerCallbacks.current.forEach(cb => cb(data));
    });

    ws.on('voice_ice_candidate', (data: { fromUserId: string; fromUsername: string; candidate: RTCIceCandidateInit }) => {
      voiceIceCandidateCallbacks.current.forEach(cb => cb(data));
    });

    setSocket(ws);
  }, [cleanup, connected]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const joinChannel = useCallback((channelId: string) => {
    console.log('[WS] joinChannel called for:', channelId, 'connected:', socketRef.current?.connected);
    if (socketRef.current?.connected) {
      socketRef.current.emit('join_channel', channelId);
    } else {
      // Queue the channel join for when the connection is established
      pendingChannelJoinRef.current = channelId;
    }
  }, []);

  const sendMessage = useCallback((channelId: string, content: string) => {
    socketRef.current?.emit('send_message', { channelId, content });
  }, []);

  // Emite new_message com a mensagem completa (do retorno da REST) para broadcast
  // aos outros clientes. O remetente já adicionou a mensagem localmente via REST.
  const broadcastNewMessage = useCallback((message: Message) => {
    socketRef.current?.emit('new_message', message);
  }, []);

  const joinVoice = useCallback((channelId: string) => {
    socketRef.current?.emit('join_voice', channelId);
  }, []);

  const leaveVoice = useCallback((channelId: string) => {
    socketRef.current?.emit('leave_voice', channelId);
  }, []);

  const sendVoiceOffer = useCallback((channelId: string, targetUserId: string, offer: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('voice_offer', { channelId, targetUserId, offer });
  }, []);

  const sendVoiceAnswer = useCallback((channelId: string, targetUserId: string, answer: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('voice_answer', { channelId, targetUserId, answer });
  }, []);

  const sendVoiceIceCandidate = useCallback((channelId: string, targetUserId: string, candidate: RTCIceCandidateInit) => {
    socketRef.current?.emit('voice_ice_candidate', { channelId, targetUserId, candidate });
  }, []);

  const onMessage = useCallback((callback: (message: Message) => void) => {
    messageCallbacks.current.add(callback);
    return () => messageCallbacks.current.delete(callback);
  }, []);

  const onJoined = useCallback((callback: (channelId: string) => void) => {
    joinedCallbacks.current.add(callback);
    return () => joinedCallbacks.current.delete(callback);
  }, []);

  const onVoiceJoined = useCallback((callback: (data: { channelId: string; participants: VoiceParticipant[] }) => void) => {
    voiceJoinedCallbacks.current.add(callback);
    return () => voiceJoinedCallbacks.current.delete(callback);
  }, []);

  const onVoiceLeft = useCallback((callback: (data: { channelId: string }) => void) => {
    voiceLeftCallbacks.current.add(callback);
    return () => voiceLeftCallbacks.current.delete(callback);
  }, []);

  const onVoiceUserJoined = useCallback((callback: (data: { userId: string; username: string }) => void) => {
    voiceUserJoinedCallbacks.current.add(callback);
    return () => voiceUserJoinedCallbacks.current.delete(callback);
  }, []);

  const onVoiceUserLeft = useCallback((callback: (data: { userId: string; username: string }) => void) => {
    voiceUserLeftCallbacks.current.add(callback);
    return () => voiceUserLeftCallbacks.current.delete(callback);
  }, []);

  const onVoiceOffer = useCallback((callback: (data: { fromUserId: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => void) => {
    voiceOfferCallbacks.current.add(callback);
    return () => voiceOfferCallbacks.current.delete(callback);
  }, []);

  const onVoiceAnswer = useCallback((callback: (data: { fromUserId: string; fromUsername: string; answer: RTCSessionDescriptionInit }) => void) => {
    voiceAnswerCallbacks.current.add(callback);
    return () => voiceAnswerCallbacks.current.delete(callback);
  }, []);

  const onVoiceIceCandidate = useCallback((callback: (data: { fromUserId: string; fromUsername: string; candidate: RTCIceCandidateInit }) => void) => {
    voiceIceCandidateCallbacks.current.add(callback);
    return () => voiceIceCandidateCallbacks.current.delete(callback);
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        connect,
        disconnect,
        joinChannel,
        sendMessage,
        broadcastNewMessage,
        onMessage,
        onJoined,
        joinVoice,
        leaveVoice,
        onVoiceJoined,
        onVoiceLeft,
        onVoiceUserJoined,
        onVoiceUserLeft,
        onVoiceOffer,
        onVoiceAnswer,
        onVoiceIceCandidate,
        sendVoiceOffer,
        sendVoiceAnswer,
        sendVoiceIceCandidate,
        connected,
        inVoiceChannel,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWebSocket must be used within WebSocketProvider');
  return context;
}