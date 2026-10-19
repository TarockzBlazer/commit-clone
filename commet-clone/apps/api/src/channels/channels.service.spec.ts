import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChannelsService', () => {
  let service: ChannelsService;
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
    createdAt: new Date(),
    updatedAt: new Date(),
    server: {
      ...mockServer,
      members: [{ id: 'member-1', userId: 'user-1', serverId: 'server-1', role: 'owner', joinedAt: new Date() }],
    },
  };

  beforeEach(async () => {
    const mockPrisma = {
      server: {
        findUnique: jest.fn(),
      },
      channel: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a channel if user is member', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        members: [{ userId: 'user-1' }],
      });
      prisma.channel.create.mockResolvedValue({
        id: 'channel-1',
        name: 'general',
        type: 'text',
        serverId: 'server-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        server: mockServer,
      });

      const result = await service.create('server-1', 'general', 'text', 'user-1');

      expect(prisma.server.findUnique).toHaveBeenCalledWith({
        where: { id: 'server-1' },
        include: { members: true },
      });
      expect(prisma.channel.create).toHaveBeenCalledWith({
        data: { name: 'general', type: 'text', serverId: 'server-1' },
        include: { server: true },
      });
      expect(result.name).toBe('general');
      expect(result.type).toBe('text');
    });

    it('should throw NotFoundException if server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(service.create('server-1', 'general', 'text', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        members: [{ userId: 'user-2' }],
      });

      await expect(service.create('server-1', 'general', 'text', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return channels if user is member', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        members: [{ userId: 'user-1' }],
      });
      prisma.channel.findMany.mockResolvedValue([{ id: 'channel-1', name: 'general', type: 'text' }]);

      const result = await service.findAll('server-1', 'user-1');

      expect(prisma.channel.findMany).toHaveBeenCalledWith({
        where: { serverId: 'server-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException if server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(service.findAll('server-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        members: [{ userId: 'user-2' }],
      });

      await expect(service.findAll('server-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return channel if user is member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-1' }] },
      });

      const result = await service.findOne('channel-1', 'user-1');

      expect(prisma.channel.findUnique).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        include: { server: { include: { members: true } } },
      });
      expect(result.id).toBe(mockChannel.id);
      expect(result.name).toBe(mockChannel.name);
      expect(result.type).toBe(mockChannel.type);
      expect(result.serverId).toBe(mockChannel.serverId);
    });

    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.findOne('channel-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-2' }] },
      });

      await expect(service.findOne('channel-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update channel if user is server owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-1' }] },
      });
      prisma.server.findUnique.mockResolvedValue({ ...mockServer, ownerId: 'user-1' });
      prisma.channel.update.mockResolvedValue({
        ...mockChannel,
        name: 'general-updated',
      });

      const result = await service.update('channel-1', 'general-updated', 'user-1');

      expect(prisma.channel.update).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        data: { name: 'general-updated' },
      });
      expect(result.name).toBe('general-updated');
    });

    it('should throw ForbiddenException if user is not server owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-1' }] },
      });
      prisma.server.findUnique.mockResolvedValue({ ...mockServer, ownerId: 'user-2' });

      await expect(service.update('channel-1', 'new-name', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete channel if user is server owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-1' }] },
      });
      prisma.server.findUnique.mockResolvedValue({ ...mockServer, ownerId: 'user-1' });
      prisma.channel.delete.mockResolvedValue({});

      await service.delete('channel-1', 'user-1');

      expect(prisma.channel.delete).toHaveBeenCalledWith({ where: { id: 'channel-1' } });
    });

    it('should throw ForbiddenException if user is not server owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        ...mockChannel,
        server: { ...mockServer, members: [{ userId: 'user-1' }] },
      });
      prisma.server.findUnique.mockResolvedValue({ ...mockServer, ownerId: 'user-2' });

      await expect(service.delete('channel-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });
});