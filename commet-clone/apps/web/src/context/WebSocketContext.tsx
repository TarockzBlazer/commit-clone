'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { Message } from '@/lib/api';

interface VoiceParticipant {
  userId: string;
  username: string;
}

interface WebSocketContextType {
  socket: WebSocket | null;
  connect: (token: string) => void;
  disconnect: () => void;
  joinChannel: (channelId: string) => void;
  sendMessage: (channelId: string, content: string) => void;
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

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000/ws-chat';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
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
  const socketRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  inVoiceChannelRef.current = inVoiceChannel;
  socketRef.current = socket;

  const cleanup = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    const currentSocket = socketRef.current;
    if (currentSocket) {
      currentSocket.onclose = null;
      currentSocket.onerror = null;
      currentSocket.onmessage = null;
      currentSocket.close();
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
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected, skipping');
      return;
    }

    isConnectingRef.current = true;
    tokenRef.current = token;
    cleanup();

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      isConnectingRef.current = false;
      socketRef.current = ws;
      setSocket(ws);
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      const wasConnected = connected;
      setConnected(false);
      setInVoiceChannel(null);
      inVoiceChannelRef.current = null;
      socketRef.current = null;
      setSocket(null);
      console.log('[WS] Disconnected, was connected:', wasConnected);

      if (wasConnected) {
        reconnectTimeout.current = setTimeout(() => {
          const storedToken = tokenRef.current || localStorage.getItem('token');
          if (storedToken && !isConnectingRef.current) {
            connect(storedToken);
          }
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'new_message' && data.data) {
          messageCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'joined' && data.data) {
          joinedCallbacks.current.forEach(cb => cb(data.data.channelId));
        } else if (data.event === 'voice_joined' && data.data) {
          setInVoiceChannel(data.data.channelId);
          inVoiceChannelRef.current = data.data.channelId;
          voiceJoinedCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_left' && data.data) {
          const currentChannel = inVoiceChannelRef.current;
          if (currentChannel === data.data.channelId) {
            setInVoiceChannel(null);
            inVoiceChannelRef.current = null;
          }
          voiceLeftCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_user_joined' && data.data) {
          voiceUserJoinedCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_user_left' && data.data) {
          voiceUserLeftCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_offer' && data.data) {
          voiceOfferCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_answer' && data.data) {
          voiceAnswerCallbacks.current.forEach(cb => cb(data.data));
        } else if (data.event === 'voice_ice_candidate' && data.data) {
          voiceIceCandidateCallbacks.current.forEach(cb => cb(data.data));
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    setSocket(ws);
  }, [cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const joinChannel = useCallback((channelId: string) => {
    socketRef.current?.send(JSON.stringify({ event: 'join_channel', data: channelId }));
  }, []);

  const sendMessage = useCallback((channelId: string, content: string) => {
    socketRef.current?.send(JSON.stringify({ event: 'send_message', data: { channelId, content } }));
  }, []);

  const joinVoice = useCallback((channelId: string) => {
    socketRef.current?.send(JSON.stringify({ event: 'join_voice', data: channelId }));
  }, []);

  const leaveVoice = useCallback((channelId: string) => {
    socketRef.current?.send(JSON.stringify({ event: 'leave_voice', data: channelId }));
  }, []);

  const sendVoiceOffer = useCallback((channelId: string, targetUserId: string, offer: RTCSessionDescriptionInit) => {
    socketRef.current?.send(JSON.stringify({ event: 'voice_offer', data: { channelId, targetUserId, offer } }));
  }, []);

  const sendVoiceAnswer = useCallback((channelId: string, targetUserId: string, answer: RTCSessionDescriptionInit) => {
    socketRef.current?.send(JSON.stringify({ event: 'voice_answer', data: { channelId, targetUserId, answer } }));
  }, []);

  const sendVoiceIceCandidate = useCallback((channelId: string, targetUserId: string, candidate: RTCIceCandidateInit) => {
    socketRef.current?.send(JSON.stringify({ event: 'voice_ice_candidate', data: { channelId, targetUserId, candidate } }));
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