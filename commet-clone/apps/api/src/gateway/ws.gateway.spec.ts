import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WsGateway } from './ws.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { Server, Socket } from 'socket.io';

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

describe('WsGateway', () => {
  let gateway: WsGateway;
  let prisma: any;
  let jwtService: jest.Mocked<JwtService>;
  let mockServer: any;
  let mockSocket: any;

  const mockPayload = { sub: 'user-1', username: 'testuser' };
  const mockChannel = {
    id: 'channel-1',
    serverId: 'server-1',
    type: 'voice',
    server: {
      members: [{ userId: 'user-1' }],
    },
  };
  const mockTextChannel = {
    ...mockChannel,
    type: 'text',
  };

  beforeEach(async () => {
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;

    mockSocket = {
      id: 'socket-1',
      data: {},
      handshake: {
        auth: {},
        query: {},
        headers: {},
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
    } as any;

    const mockPrisma = {
      channel: {
        findUnique: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
    };

    const mockJwtService = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    gateway = module.get<WsGateway>(WsGateway);
    gateway['server'] = mockServer;
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should disconnect if no token provided', async () => {
      const socket = { ...mockSocket, handshake: { auth: {}, query: {}, headers: {} } };

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect if token is invalid', async () => {
      const socket = {
        ...mockSocket,
        handshake: { auth: { token: 'invalid' }, query: {}, headers: {} },
      };
      jwtService.verify.mockImplementation(() => { throw new Error('Invalid token'); });

      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should attach user data and not disconnect if token is valid', async () => {
      const socket = {
        ...mockSocket,
        handshake: { auth: { token: 'valid-token' }, query: {}, headers: {} },
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'user-1', username: 'testuser' });

      await gateway.handleConnection(socket as any);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(socket.data.user).toEqual({ sub: 'user-1', username: 'testuser' });
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('should read token from query param', async () => {
      const socket = {
        ...mockSocket,
        handshake: { auth: {}, query: { token: 'query-token' }, headers: {} },
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'user-1', username: 'testuser' });

      await gateway.handleConnection(socket as any);

      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
      expect(socket.data.user).toEqual({ sub: 'user-1', username: 'testuser' });
    });

    it('should read token from authorization header', async () => {
      const socket = {
        ...mockSocket,
        handshake: { auth: {}, query: {}, headers: { authorization: 'Bearer header-token' } },
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'user-1', username: 'testuser' });

      await gateway.handleConnection(socket as any);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token');
    });
  });

  describe('handleDisconnect', () => {
    it('should log disconnect', () => {
      gateway.handleDisconnect(mockSocket as any);
    });

    it('should cleanup voice participant on disconnect', () => {
      mockSocket.id = 'socket-1';
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
      
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      gateway.handleDisconnect(mockSocket as any);

      expect(mockServer.to).toHaveBeenCalledWith('voice:channel-1');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_user_left', {
        userId: 'user-1',
        username: 'testuser',
      });
    });
  });

  describe('handleJoinChannel', () => {
    it('should join channel if user is member', async () => {
      mockSocket.data = { user: { sub: 'user-1' } };
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { members: [{ userId: 'user-1' }] },
      });

      await gateway.handleJoinChannel(mockSocket as any, 'channel-1');

      expect(mockSocket.join).toHaveBeenCalledWith('channel:channel-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('joined', { channelId: 'channel-1' });
    });

    it('should not join if user not authenticated', async () => {
      mockSocket.data = {};

      await gateway.handleJoinChannel(mockSocket as any, 'channel-1');

      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should return early if channel not found', async () => {
      mockSocket.data = { user: { sub: 'user-1' } };
      prisma.channel.findUnique.mockResolvedValue(null);

      await gateway.handleJoinChannel(mockSocket as any, 'channel-1');

      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should emit error if user is not a member', async () => {
      mockSocket.data = { user: { sub: 'user-2' } };
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { members: [{ userId: 'user-1' }] },
      });

      await gateway.handleJoinChannel(mockSocket as any, 'channel-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this server' });
    });
  });

  describe('handleMessage', () => {
    it('should create and broadcast message if user is member', async () => {
      mockSocket.data = { user: { sub: 'user-1' } };
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { members: [{ userId: 'user-1' }] },
      });
      const mockMessage = {
        id: 'msg-1',
        content: 'Hello',
        userId: 'user-1',
        channelId: 'channel-1',
        createdAt: new Date(),
        user: { id: 'user-1', username: 'testuser' },
      };
      prisma.message.create.mockResolvedValue(mockMessage);

      await gateway.handleMessage(mockSocket as any, { channelId: 'channel-1', content: 'Hello' });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          content: 'Hello',
          channelId: 'channel-1',
          userId: 'user-1',
        },
        include: { user: { select: { id: true, username: true } } },
      });
      expect(mockServer.to).toHaveBeenCalledWith('channel:channel-1');
      expect(mockServer.to().emit).toHaveBeenCalledWith('new_message', mockMessage);
    });

    it('should not send if user not authenticated', async () => {
      mockSocket.data = {};

      await gateway.handleMessage(mockSocket as any, { channelId: 'channel-1', content: 'Hello' });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('should not send if channel not found', async () => {
      mockSocket.data = { user: { sub: 'user-1' } };
      prisma.channel.findUnique.mockResolvedValue(null);

      await gateway.handleMessage(mockSocket as any, { channelId: 'channel-1', content: 'Hello' });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('should not send if user is not a member', async () => {
      mockSocket.data = { user: { sub: 'user-2' } };
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { members: [{ userId: 'user-1' }] },
      });

      await gateway.handleMessage(mockSocket as any, { channelId: 'channel-1', content: 'Hello' });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinVoice', () => {
    beforeEach(() => {
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
      prisma.channel.findUnique.mockResolvedValue(mockChannel);
    });

    it('should join voice channel and emit voice_joined with existing participants', async () => {
      const existingParticipant = { socketId: 'socket-2', userId: 'user-2', username: 'user2' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-2', existingParticipant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleJoinVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.join).toHaveBeenCalledWith('voice:channel-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('voice_joined', {
        channelId: 'channel-1',
        participants: [{ userId: 'user-2', username: 'user2' }],
      });
      expect(mockServer.to).toHaveBeenCalledWith('voice:channel-1');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_user_joined', {
        userId: 'user-1',
        username: 'testuser',
      });
    });

    it('should emit error if channel is not voice type', async () => {
      prisma.channel.findUnique.mockResolvedValue(mockTextChannel);

      await gateway.handleJoinVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Voice channel not found' });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should emit error if user is not a member', async () => {
      mockSocket.data = { user: { sub: 'user-2', username: 'testuser2' } };
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { members: [{ userId: 'user-1' }] },
      });

      await gateway.handleJoinVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this server' });
    });

    it('should emit error if user already in voice channel', async () => {
      const existingParticipant = { socketId: 'socket-1', userId: 'user-1', username: 'testuser' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', existingParticipant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleJoinVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Already in voice channel' });
    });

    it('should not join if user not authenticated', async () => {
      mockSocket.data = {};

      await gateway.handleJoinVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleLeaveVoice', () => {
    beforeEach(() => {
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
    });

    it('should leave voice channel and notify others', async () => {
      const participant = { socketId: 'socket-1', userId: 'user-1', username: 'testuser' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', participant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleLeaveVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.leave).toHaveBeenCalledWith('voice:channel-1');
      expect(mockServer.to).toHaveBeenCalledWith('voice:channel-1');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_user_left', {
        userId: 'user-1',
        username: 'testuser',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('voice_left', { channelId: 'channel-1' });
    });

    it('should delete channel when last participant leaves', async () => {
      const participant = { socketId: 'socket-1', userId: 'user-1', username: 'testuser' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', participant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleLeaveVoice(mockSocket as any, 'channel-1');

      expect((gateway as any).voiceChannels.has('channel-1')).toBe(false);
    });

    it('should not leave if user not authenticated', async () => {
      mockSocket.data = {};

      await gateway.handleLeaveVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.leave).not.toHaveBeenCalled();
    });

    it('should not leave if user not in channel', async () => {
      (gateway as any).voiceChannels.set('channel-1', new Map());

      await gateway.handleLeaveVoice(mockSocket as any, 'channel-1');

      expect(mockSocket.leave).not.toHaveBeenCalled();
    });
  });

  describe('handleVoiceOffer', () => {
    beforeEach(() => {
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
    });

    it('should forward offer to target user', async () => {
      const targetParticipant = { socketId: 'socket-2', userId: 'user-2', username: 'user2' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      voiceChannel.set('socket-2', targetParticipant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'sdp-data' };
      await gateway.handleVoiceOffer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        offer,
      });

      expect(mockServer.to).toHaveBeenCalledWith('socket-2');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_offer', {
        fromUserId: 'user-1',
        fromUsername: 'testuser',
        offer,
      });
    });

    it('should not forward if sender not in channel', async () => {
      (gateway as any).voiceChannels.set('channel-1', new Map());

      await gateway.handleVoiceOffer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        offer: { type: 'offer', sdp: 'sdp-data' },
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in voice channel' });
    });

    it('should not forward if target not in channel', async () => {
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleVoiceOffer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        offer: { type: 'offer', sdp: 'sdp-data' },
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Target user not in voice channel' });
    });

    it('should not forward if not authenticated', async () => {
      mockSocket.data = {};

      await gateway.handleVoiceOffer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        offer: { type: 'offer', sdp: 'sdp-data' },
      });

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('handleVoiceAnswer', () => {
    beforeEach(() => {
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
    });

    it('should forward answer to target user', async () => {
      const targetParticipant = { socketId: 'socket-2', userId: 'user-2', username: 'user2' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      voiceChannel.set('socket-2', targetParticipant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      const answer: RTCSessionDescriptionInit = { type: 'answer', sdp: 'sdp-data' };
      await gateway.handleVoiceAnswer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        answer,
      });

      expect(mockServer.to).toHaveBeenCalledWith('socket-2');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_answer', {
        fromUserId: 'user-1',
        fromUsername: 'testuser',
        answer,
      });
    });

    it('should emit error if sender not in channel', async () => {
      (gateway as any).voiceChannels.set('channel-1', new Map());

      await gateway.handleVoiceAnswer(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        answer: { type: 'answer', sdp: 'sdp-data' },
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in voice channel' });
    });
  });

  describe('handleVoiceIceCandidate', () => {
    beforeEach(() => {
      mockSocket.data = { user: { sub: 'user-1', username: 'testuser' } };
    });

    it('should forward ICE candidate to target user', async () => {
      const targetParticipant = { socketId: 'socket-2', userId: 'user-2', username: 'user2' };
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      voiceChannel.set('socket-2', targetParticipant);
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      const candidate = { candidate: 'candidate-data', sdpMid: '0', sdpMLineIndex: 0 };
      await gateway.handleVoiceIceCandidate(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        candidate,
      });

      expect(mockServer.to).toHaveBeenCalledWith('socket-2');
      expect(mockServer.to().emit).toHaveBeenCalledWith('voice_ice_candidate', {
        fromUserId: 'user-1',
        fromUsername: 'testuser',
        candidate,
      });
    });

    it('should silently drop if sender not in channel', async () => {
      (gateway as any).voiceChannels.set('channel-1', new Map());

      await gateway.handleVoiceIceCandidate(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        candidate: { candidate: 'candidate-data' },
      });

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should silently drop if target not in channel', async () => {
      const voiceChannel = new Map();
      voiceChannel.set('socket-1', { socketId: 'socket-1', userId: 'user-1', username: 'testuser' });
      (gateway as any).voiceChannels.set('channel-1', voiceChannel);

      await gateway.handleVoiceIceCandidate(mockSocket as any, {
        channelId: 'channel-1',
        targetUserId: 'user-2',
        candidate: { candidate: 'candidate-data' },
      });

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });
});