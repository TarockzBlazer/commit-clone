import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
const debugLog = (msg: string) => fs.appendFileSync('/tmp/ws-debug.log', `${new Date().toISOString()} ${msg}\n`);

interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string;
}

interface VoiceParticipant {
  socketId: string;
  userId: string;
  username: string;
}

@WebSocketGateway({ cors: true, namespace: '/ws-chat' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private voiceChannels = new Map<string, Map<string, VoiceParticipant>>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    debugLog(`[WS] handleConnection called for client ${client.id}`);
    const token = client.handshake.auth?.token || 
      client.handshake.query?.token || 
      client.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      debugLog('[WS] No token, disconnecting');
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      debugLog(`[WS] Connected user: ${payload.sub} ${payload.username}`);
    } catch (e: any) {
      debugLog(`[WS] JWT verify failed: ${e.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    debugLog(`[WS] handleDisconnect for client ${client.id}`);
    this.cleanupVoiceParticipant(client);
  }

  private cleanupVoiceParticipant(client: Socket) {
    this.voiceChannels.forEach((participants, channelId) => {
      const participant = participants.get(client.id);
      if (participant) {
        participants.delete(client.id);
        debugLog(`[WS] User ${participant.username} left voice channel ${channelId}`);
        this.server.to(`voice:${channelId}`).emit('voice_user_left', {
          userId: participant.userId,
          username: participant.username,
        });
        if (participants.size === 0) {
          this.voiceChannels.delete(channelId);
        }
      }
    });
  }

  private getVoiceParticipants(channelId: string): VoiceParticipant[] {
    const participants = this.voiceChannels.get(channelId);
    return participants ? Array.from(participants.values()) : [];
  }

  private getParticipantByUserId(channelId: string, userId: string): VoiceParticipant | undefined {
    const participants = this.voiceChannels.get(channelId);
    if (!participants) return undefined;
    return Array.from(participants.values()).find(p => p.userId === userId);
  }

  private getParticipantBySocketId(channelId: string, socketId: string): VoiceParticipant | undefined {
    return this.voiceChannels.get(channelId)?.get(socketId);
  }

  private isParticipantInChannel(channelId: string, userId: string): boolean {
    return this.getParticipantByUserId(channelId, userId) !== undefined;
  }

  private addVoiceParticipant(channelId: string, participant: VoiceParticipant) {
    if (!this.voiceChannels.has(channelId)) {
      this.voiceChannels.set(channelId, new Map());
    }
    this.voiceChannels.get(channelId)!.set(participant.socketId, participant);
  }

  @SubscribeMessage('join_channel')
  async handleJoinChannel(client: Socket, channelId: string) {
    if (!client.data.user) return;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: { include: { members: true } } },
    });
    if (!channel) return;
    const isMember = channel.server.members.some(m => m.userId === client.data.user.sub);
    if (!isMember) {
      client.emit('error', { message: 'Not a member of this server' });
      return;
    }
    client.join(`channel:${channelId}`);
    client.emit('joined', { channelId });
  }

  @SubscribeMessage('send_message')
  async handleMessage(client: Socket, data: { channelId: string; content: string }) {
    if (!client.data.user) return;
    const channel = await this.prisma.channel.findUnique({
      where: { id: data.channelId },
      include: { server: { include: { members: true } } },
    });
    if (!channel) return;
    const isMember = channel.server.members.some(m => m.userId === client.data.user.sub);
    if (!isMember) return;

    const message = await this.prisma.message.create({
      data: {
        content: data.content,
        channelId: data.channelId,
        userId: client.data.user.sub,
      },
      include: { user: { select: { id: true, username: true } } },
    });

    this.server.to(`channel:${data.channelId}`).emit('new_message', message);
  }

  @SubscribeMessage('join_voice')
  async handleJoinVoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() channelId: string,
  ) {
    if (!client.data.user) return;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: { include: { members: true } } },
    });
    if (!channel || channel.type !== 'voice') {
      client.emit('error', { message: 'Voice channel not found' });
      return;
    }
    const isMember = channel.server.members.some(m => m.userId === client.data.user.sub);
    if (!isMember) {
      client.emit('error', { message: 'Not a member of this server' });
      return;
    }

    const existingParticipants = this.getVoiceParticipants(channelId);
    const alreadyInChannel = existingParticipants.some(p => p.userId === client.data.user.sub);
    if (alreadyInChannel) {
      client.emit('error', { message: 'Already in voice channel' });
      return;
    }

    const participant: VoiceParticipant = {
      socketId: client.id,
      userId: client.data.user.sub,
      username: client.data.user.username,
    };

    this.addVoiceParticipant(channelId, participant);
    client.join(`voice:${channelId}`);

    client.emit('voice_joined', {
      channelId,
      participants: existingParticipants.map(p => ({
        userId: p.userId,
        username: p.username,
      })),
    });

    this.server.to(`voice:${channelId}`).emit('voice_user_joined', {
      userId: participant.userId,
      username: participant.username,
    });

    debugLog(`[WS] User ${participant.username} joined voice channel ${channelId}`);
  }

  @SubscribeMessage('leave_voice')
  async handleLeaveVoice(
    @ConnectedSocket() client: Socket,
    @MessageBody() channelId: string,
  ) {
    if (!client.data.user) return;
    const participants = this.voiceChannels.get(channelId);
    if (!participants) return;

    const participant = participants.get(client.id);
    if (!participant) return;

    participants.delete(client.id);
    client.leave(`voice:${channelId}`);

    this.server.to(`voice:${channelId}`).emit('voice_user_left', {
      userId: participant.userId,
      username: participant.username,
    });

    if (participants.size === 0) {
      this.voiceChannels.delete(channelId);
    }

    client.emit('voice_left', { channelId });
    debugLog(`[WS] User ${participant.username} left voice channel ${channelId}`);
  }

  @SubscribeMessage('voice_offer')
  handleVoiceOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; targetUserId: string; offer: RTCSessionDescriptionInit },
  ) {
    if (!client.data.user) return;
    const fromUserId = client.data.user.sub;
    
    if (!this.isParticipantInChannel(data.channelId, fromUserId)) {
      client.emit('error', { message: 'Not in voice channel' });
      return;
    }
    if (!this.isParticipantInChannel(data.channelId, data.targetUserId)) {
      client.emit('error', { message: 'Target user not in voice channel' });
      return;
    }

    const targetParticipant = this.getParticipantByUserId(data.channelId, data.targetUserId);
    if (!targetParticipant) return;

    this.server.to(targetParticipant.socketId).emit('voice_offer', {
      fromUserId,
      fromUsername: client.data.user.username,
      offer: data.offer,
    });
  }

  @SubscribeMessage('voice_answer')
  handleVoiceAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; targetUserId: string; answer: RTCSessionDescriptionInit },
  ) {
    if (!client.data.user) return;
    const fromUserId = client.data.user.sub;
    
    if (!this.isParticipantInChannel(data.channelId, fromUserId)) {
      client.emit('error', { message: 'Not in voice channel' });
      return;
    }
    if (!this.isParticipantInChannel(data.channelId, data.targetUserId)) {
      client.emit('error', { message: 'Target user not in voice channel' });
      return;
    }

    const targetParticipant = this.getParticipantByUserId(data.channelId, data.targetUserId);
    if (!targetParticipant) return;

    this.server.to(targetParticipant.socketId).emit('voice_answer', {
      fromUserId,
      fromUsername: client.data.user.username,
      answer: data.answer,
    });
  }

  @SubscribeMessage('voice_ice_candidate')
  handleVoiceIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; targetUserId: string; candidate: RTCIceCandidateInit },
  ) {
    if (!client.data.user) return;
    const fromUserId = client.data.user.sub;
    
    if (!this.isParticipantInChannel(data.channelId, fromUserId)) {
      return;
    }
    if (!this.isParticipantInChannel(data.channelId, data.targetUserId)) {
      return;
    }

    const targetParticipant = this.getParticipantByUserId(data.channelId, data.targetUserId);
    if (!targetParticipant) return;

    this.server.to(targetParticipant.socketId).emit('voice_ice_candidate', {
      fromUserId,
      fromUsername: client.data.user.username,
      candidate: data.candidate,
    });
  }
}