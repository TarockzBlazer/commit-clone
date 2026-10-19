'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';

interface VoiceParticipant {
  userId: string;
  username: string;
}

interface PeerConnectionState {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  remoteStream: MediaStream | null;
  iceCandidateBuffer: RTCIceCandidateInit[];
  hasLocalStream: boolean;
}

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function VoiceChannel({ channelId, userId }: { channelId: string; userId: string }) {
  const {
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
  } = useWebSocket();

  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerConnections = useRef<Map<string, PeerConnectionState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const isJoinedRef = useRef(false);
  const userIdRef = useRef(userId);
  const pendingOffers = useRef<Set<string>>(new Set());

  userIdRef.current = userId;

  const createPeerConnection = useCallback((targetUserId: string, targetUsername: string, isInitiator: boolean) => {
    if (peerConnections.current.has(targetUserId)) {
      return peerConnections.current.get(targetUserId)!;
    }

    const pc = new RTCPeerConnection(STUN_SERVERS);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.muted = isDeafened;

    const state: PeerConnectionState = {
      pc,
      audioEl,
      remoteStream: null,
      iceCandidateBuffer: [],
      hasLocalStream: false,
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      state.remoteStream = remoteStream;
      audioEl.srcObject = remoteStream;
      peerConnections.current.set(targetUserId, state);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendVoiceIceCandidate(channelId, targetUserId, event.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Voice] ICE state with ${targetUsername}:`, pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.log(`[Voice] Peer connection to ${targetUsername} closed:`, pc.connectionState);
        cleanupPeerConnection(targetUserId);
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendVoiceOffer(channelId, targetUserId, offer);
      } catch (err) {
        console.error('[Voice] Error creating offer:', err);
      }
    };

    peerConnections.current.set(targetUserId, state);

    if (localStreamRef.current) {
      addLocalStreamToPeerConnection(targetUserId, localStreamRef.current);
    }

    return state;
  }, [channelId, sendVoiceIceCandidate, sendVoiceOffer, isDeafened]);

  const addLocalStreamToPeerConnection = useCallback((targetUserId: string, stream: MediaStream) => {
    const state = peerConnections.current.get(targetUserId);
    if (!state) return;

    stream.getTracks().forEach(track => {
      const sender = state.pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track);
      } else {
        state.pc.addTrack(track, stream);
      }
    });
    state.hasLocalStream = true;

    flushIceCandidateBuffer(targetUserId);
  }, []);

  const flushIceCandidateBuffer = useCallback((targetUserId: string) => {
    const state = peerConnections.current.get(targetUserId);
    if (!state || state.iceCandidateBuffer.length === 0) return;

    console.log(`[Voice] Flushing ${state.iceCandidateBuffer.length} buffered ICE candidates for ${targetUserId}`);
    state.iceCandidateBuffer.forEach(candidate => {
      state.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
        console.error('[Voice] Error adding buffered ICE candidate:', err);
      });
    });
    state.iceCandidateBuffer = [];
  }, []);

  const cleanupPeerConnection = useCallback((targetUserId: string) => {
    const state = peerConnections.current.get(targetUserId);
    if (state) {
      state.pc.close();
      state.audioEl.srcObject = null;
      state.audioEl.remove();
      peerConnections.current.delete(targetUserId);
    }
    pendingOffers.current.delete(targetUserId);
  }, []);

  const handleVoiceJoined = useCallback((data: { channelId: string; participants: VoiceParticipant[] }) => {
    if (data.channelId !== channelId) return;
    console.log('[Voice] Joined voice channel, existing participants:', data.participants);
    setParticipants(data.participants);
    
    data.participants.forEach(participant => {
      if (participant.userId !== userIdRef.current) {
        createPeerConnection(participant.userId, participant.username, true);
      }
    });
  }, [channelId, createPeerConnection]);

  const handleVoiceLeft = useCallback((data: { channelId: string }) => {
    if (data.channelId !== channelId) return;
    console.log('[Voice] Left voice channel');
    setParticipants([]);
    peerConnections.current.forEach((_, targetUserId) => {
      cleanupPeerConnection(targetUserId);
    });
  }, [channelId, cleanupPeerConnection]);

  const handleVoiceUserJoined = useCallback((data: { userId: string; username: string }) => {
    if (data.userId === userIdRef.current) return;
    console.log('[Voice] User joined:', data.username);
    setParticipants(prev => [...prev, data]);
    createPeerConnection(data.userId, data.username, true);
  }, [createPeerConnection]);

  const handleVoiceUserLeft = useCallback((data: { userId: string; username: string }) => {
    console.log('[Voice] User left:', data.username);
    setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    cleanupPeerConnection(data.userId);
  }, [cleanupPeerConnection]);

  const handleVoiceOffer = useCallback(async (data: { fromUserId: string; fromUsername: string; offer: RTCSessionDescriptionInit }) => {
    if (data.fromUserId === userIdRef.current) return;
    console.log('[Voice] Received offer from:', data.fromUsername);
    
    const offerKey = `${data.fromUserId}:${JSON.stringify(data.offer)}`;
    if (pendingOffers.current.has(offerKey)) {
      console.log('[Voice] Duplicate offer ignored');
      return;
    }
    pendingOffers.current.add(offerKey);

    let state = peerConnections.current.get(data.fromUserId);
    if (!state) {
      state = createPeerConnection(data.fromUserId, data.fromUsername, false);
    }

    try {
      await state.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      sendVoiceAnswer(channelId, data.fromUserId, answer);
    } catch (err) {
      console.error('[Voice] Error handling offer:', err);
    } finally {
      pendingOffers.current.delete(offerKey);
    }
  }, [channelId, createPeerConnection, sendVoiceAnswer]);

  const handleVoiceAnswer = useCallback(async (data: { fromUserId: string; fromUsername: string; answer: RTCSessionDescriptionInit }) => {
    if (data.fromUserId === userIdRef.current) return;
    console.log('[Voice] Received answer from:', data.fromUsername);
    
    const state = peerConnections.current.get(data.fromUserId);
    if (!state) {
      console.warn('[Voice] Received answer but no peer connection exists');
      return;
    }

    try {
      await state.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (err) {
      console.error('[Voice] Error handling answer:', err);
    }
  }, []);

  const handleVoiceIceCandidate = useCallback(async (data: { fromUserId: string; fromUsername: string; candidate: RTCIceCandidateInit }) => {
    if (data.fromUserId === userIdRef.current) return;
    
    const state = peerConnections.current.get(data.fromUserId);
    if (!state) {
      console.log('[Voice] Buffering ICE candidate for future peer connection:', data.fromUserId);
      return;
    }

    try {
      await state.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      if (state.pc.remoteDescription) {
        console.error('[Voice] Error adding ICE candidate:', err);
      } else {
        console.log('[Voice] Buffering ICE candidate (no remote description yet)');
        state.iceCandidateBuffer.push(data.candidate);
      }
    }
  }, []);

  useEffect(() => {
    const unsubJoined = onVoiceJoined(handleVoiceJoined);
    const unsubLeft = onVoiceLeft(handleVoiceLeft);
    const unsubUserJoined = onVoiceUserJoined(handleVoiceUserJoined);
    const unsubUserLeft = onVoiceUserLeft(handleVoiceUserLeft);
    const unsubOffer = onVoiceOffer(handleVoiceOffer);
    const unsubAnswer = onVoiceAnswer(handleVoiceAnswer);
    const unsubIce = onVoiceIceCandidate(handleVoiceIceCandidate);

    return () => {
      unsubJoined();
      unsubLeft();
      unsubUserJoined();
      unsubUserLeft();
      unsubOffer();
      unsubAnswer();
      unsubIce();
    };
  }, [onVoiceJoined, onVoiceLeft, onVoiceUserJoined, onVoiceUserLeft, onVoiceOffer, onVoiceAnswer, onVoiceIceCandidate,
      handleVoiceJoined, handleVoiceLeft, handleVoiceUserJoined, handleVoiceUserLeft, handleVoiceOffer, handleVoiceAnswer, handleVoiceIceCandidate]);

  const getUserMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });

      peerConnections.current.forEach((state, targetUserId) => {
        addLocalStreamToPeerConnection(targetUserId, stream);
      });

      return stream;
    } catch (err) {
      console.error('[Voice] getUserMedia error:', err);
      setError('Não foi possível acessar o microfone. Verifique as permissões.');
      throw err;
    }
  }, [isMuted, addLocalStreamToPeerConnection]);

  const handleJoin = useCallback(async () => {
    if (isJoinedRef.current) return;
    
    try {
      await getUserMedia();
      joinVoice(channelId);
      isJoinedRef.current = true;
      setIsJoined(true);
      setError(null);
    } catch (err) {
      console.error('[Voice] Join error:', err);
    }
  }, [channelId, joinVoice, getUserMedia]);

  const handleLeave = useCallback(() => {
    if (!isJoinedRef.current) return;
    
    leaveVoice(channelId);
    isJoinedRef.current = false;
    setIsJoined(false);
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    
    peerConnections.current.forEach((_, targetUserId) => {
      cleanupPeerConnection(targetUserId);
    });
    setParticipants([]);
    pendingOffers.current.clear();
  }, [channelId, leaveVoice, cleanupPeerConnection]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
    }
    
    peerConnections.current.forEach(state => {
      state.pc.getSenders().forEach(sender => {
        if (sender.track?.kind === 'audio') {
          sender.track.enabled = !newMuted;
        }
      });
    });
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    
    peerConnections.current.forEach(state => {
      state.audioEl.muted = newDeafened;
    });
  }, [isDeafened]);

  useEffect(() => {
    peerConnections.current.forEach(state => {
      state.audioEl.muted = isDeafened;
    });
  }, [isDeafened]);

  useEffect(() => {
    return () => {
      if (isJoinedRef.current) {
        handleLeave();
      }
    };
  }, [handleLeave]);

  if (!isJoined) {
    return (
      <div className="p-6 border-t border-[#2f2f2f] bg-[#1a1a1a]">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="mt-2 text-gray-400">Canal de voz</p>
            <p className="text-sm text-gray-500">Clique para entrar e conversar</p>
          </div>
        </div>
        <button
          onClick={handleJoin}
          disabled={isJoined}
          className="mx-auto mt-6 block px-8 py-3 bg-[#7289da] text-white rounded-full hover:bg-[#5b6eae] transition-colors disabled:opacity-50 font-medium"
        >
          Entrar no canal de voz
        </button>
        {error && (
          <p className="mt-4 text-center text-red-400 text-sm">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-[#2f2f2f] bg-[#1a1a1a]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Conectado" />
          <span className="font-medium">Conectado ao canal de voz</span>
          <span className="text-xs text-gray-400 px-2 py-0.5 bg-[#2a2a2a] rounded">
            {participants.length + 1} pessoa(s)
          </span>
        </div>
        <button
          onClick={handleLeave}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
        >
          Sair
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4 p-3 bg-[#2a2a2a] rounded-lg">
        <button
          onClick={toggleMute}
          className={`p-3 rounded-lg transition-colors ${
            isMuted ? 'bg-red-600' : 'bg-[#3a3a3a] hover:bg-[#4a4a4a]'
          }`}
          title={isMuted ? 'Desativar mudo' : 'Silenciar microfone'}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2l-4 4h4" />
            )}
          </svg>
        </button>
        <button
          onClick={toggleDeafen}
          className={`p-3 rounded-lg transition-colors ${
            isDeafened ? 'bg-orange-600' : 'bg-[#3a3a3a] hover:bg-[#4a4a4a]'
          }`}
          title={isDeafened ? 'Desativar surdo' : 'Silenciar saída'}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isDeafened ? (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19V6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 11h16" />
              </>
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4" />
            )}
          </svg>
        </button>
        <div className="flex-1 text-center text-sm text-gray-400">
          {isMuted && <span className="mr-2">🔇 Microfone mutado</span>}
          {isDeafened && <span className="mr-2">🔈 Saída mutada</span>}
          {!isMuted && !isDeafened && 'Microfone ativo'}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded-lg">
          <div className="w-8 h-8 rounded-full bg-[#7289da] flex items-center justify-center font-bold flex-shrink-0">
            {localStream ? '🎤' : '🔇'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium">Você</span>
            <span className="text-xs text-gray-500 ml-2">(local)</span>
            {isMuted && <span className="text-xs text-red-400 ml-2">🔇</span>}
            {isDeafened && <span className="text-xs text-orange-400 ml-2">🔈</span>}
          </div>
        </div>
        {participants.map(participant => {
          const state = peerConnections.current.get(participant.userId);
          const isConnected = state?.pc.connectionState === 'connected';
          return (
            <div key={participant.userId} className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[#43b581] flex items-center justify-center font-bold flex-shrink-0">
                {participant.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{participant.username}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {isConnected ? '🔊 Conectado' : '⏳ Conectando...'}
                </span>
              </div>
              <div className={`w-6 h-6 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} 
                   title={isConnected ? 'Conectado' : 'Conectando...'} />
            </div>
          );
        })}
      </div>
    </div>
  );
}