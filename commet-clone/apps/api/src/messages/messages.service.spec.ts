import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/message.dto';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: any;

  const mockServer = {
    id: 'server-1',
    name: 'Test Server',
    ownerId: 'user-1',
    members: [{ id: 'member-1', userId: 'user-1', serverId: 'server-1', role: 'owner', joinedAt: new Date() }],
  };

  const mockChannel = {
    id: 'channel-1',
    name: 'general',
    type: 'text',
    serverId: 'server-1',
    server: mockServer,
  };

  const mockMessage = {
    id: 'message-1',
    content: 'Hello world',
    userId: 'user-1',
    channelId: 'channel-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 'user-1', username: 'testuser' },
    channel: mockChannel,
  };

  beforeEach(async () => {
    const mockPrisma = {
      channel: {
        findUnique: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      server: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return messages if user is member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { ...mockChannel.server, members: [{ userId: 'user-1' }] },
      });
      prisma.message.findMany.mockResolvedValue([{ ...mockMessage }]);

      const result = await service.findAll('channel-1', 'user-1');

      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        include: { server: { include: { members: true } } },
      });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { channelId: 'channel-1' },
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.findAll('channel-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        server: { members: [{ userId: 'user-2' }] },
      });

      await expect(service.findAll('channel-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    const createDto: CreateMessageDto = {
      content: 'Hello world',
      channelId: 'channel-1',
    };

    it('should create a message if user is member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        server: { members: [{ userId: 'user-1' }] },
      });
      prisma.message.create.mockResolvedValue(mockMessage);

      const result = await service.create('channel-1', createDto, 'user-1');

      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        include: { server: { include: { members: true } } },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          content: 'Hello world',
          channelId: 'channel-1',
          userId: 'user-1',
        },
        include: { user: { select: { id: true, username: true } } },
      });
      expect(result).toEqual(mockMessage);
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.create('channel-1', createDto, 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        server: { members: [{ userId: 'user-2' }] },
      });

      await expect(service.create('channel-1', createDto, 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete message if user is author', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...mockMessage,
        channel: { server: { members: [{ userId: 'user-1' }] } },
      });
      prisma.message.delete.mockResolvedValue({});

      await service.delete('message-1', 'user-1');

      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'message-1' } });
    });

    it('should delete message if user is server owner', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...mockMessage,
        userId: 'user-2',
        channel: { serverId: 'server-1', server: { members: [{ userId: 'user-1' }], ownerId: 'user-1' } },
      });
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'user-1' });
      prisma.message.delete.mockResolvedValue({});

      await service.delete('message-1', 'user-1');

      expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'message-1' } });
    });

    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.delete('message-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...mockMessage,
        channel: { server: { members: [{ userId: 'user-2' }] } },
      });

      await expect(service.delete('message-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is not author and not server owner', async () => {
      prisma.message.findUnique.mockResolvedValue({
        ...mockMessage,
        userId: 'user-2',
        channel: { server: { members: [{ userId: 'user-1' }], ownerId: 'user-3' } },
      });

      await expect(service.delete('message-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });
});