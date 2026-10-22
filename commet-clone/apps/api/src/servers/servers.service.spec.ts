import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ServersService } from './servers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ServersService', () => {
  let service: ServersService;
  let prisma: any;

  const mockServer = {
    id: 'server-1',
    name: 'Test Server',
    ownerId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [{ id: 'member-1', userId: 'user-1', serverId: 'server-1', role: 'owner', joinedAt: new Date() }],
    owner: { id: 'user-1', username: 'testuser' },
    channels: [],
  };

  beforeEach(async () => {
    const mockPrisma = {
      server: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      serverMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      message: {
        deleteMany: jest.fn(),
      },
      channelMember: {
        deleteMany: jest.fn(),
      },
      channel: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ServersService>(ServersService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a server with owner as member', async () => {
      prisma.server.create.mockResolvedValue({
        ...mockServer,
        members: [{ id: 'member-1', userId: 'user-1', serverId: 'server-1', role: 'owner', joinedAt: new Date() }],
        owner: { id: 'user-1', username: 'testuser' },
      });

      const result = await service.create('Test Server', 'user-1');

      expect(prisma.server.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Server',
          ownerId: 'user-1',
          members: { create: { userId: 'user-1', role: 'owner' } },
        },
        include: {
          members: true,
          owner: { select: { id: true, username: true } },
        },
      });
      expect(result.name).toBe('Test Server');
      expect(result.ownerId).toBe('user-1');
    });
  });

  describe('findAll', () => {
    it('should return servers where user is a member', async () => {
      prisma.server.findMany.mockResolvedValue([mockServer]);

      const result = await service.findAll('user-1');

      expect(prisma.server.findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 'user-1' } } },
        include: {
          members: { include: { user: { select: { id: true, username: true } } } },
          owner: { select: { id: true, username: true } },
          channels: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return server if user is member', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);

      const result = await service.findOne('server-1', 'user-1');

      expect(prisma.server.findUnique).toHaveBeenCalledWith({
        where: { id: 'server-1' },
        include: {
          members: { include: { user: { select: { id: true, username: true } } } },
          owner: { select: { id: true, username: true } },
          channels: true,
        },
      });
      expect(result).toEqual(mockServer);
    });

    it('should throw NotFoundException if server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(service.findOne('server-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        members: [{ id: 'member-1', userId: 'user-2', serverId: 'server-1', role: 'owner', joinedAt: new Date() }],
      });

      await expect(service.findOne('server-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update server name if user is owner', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      prisma.server.update.mockResolvedValue({
        ...mockServer,
        name: 'Updated Server',
        owner: { id: 'user-1', username: 'testuser' },
      });

      const result = await service.update('server-1', 'Updated Server', 'user-1');

      expect(prisma.server.update).toHaveBeenCalledWith({
        where: { id: 'server-1' },
        data: { name: 'Updated Server' },
        include: { owner: { select: { id: true, username: true } } },
      });
      expect(result.name).toBe('Updated Server');
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        ownerId: 'user-2',
      });

      await expect(service.update('server-1', 'New Name', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete server if user is owner', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      prisma.$transaction.mockResolvedValue([{}]);

      const result = await service.delete('server-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Server deleted successfully' });
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...mockServer,
        ownerId: 'user-2',
      });

      await expect(service.delete('server-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leave', () => {
    it('should leave server successfully', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: 'server-1', ownerId: 'user-2' });
      prisma.serverMember.delete.mockResolvedValue({});

      const result = await service.leave('server-1', 'user-1');

      expect(prisma.serverMember.delete).toHaveBeenCalledWith({
        where: { userId_serverId: { userId: 'user-1', serverId: 'server-1' } },
      });
    });

    it('should throw NotFoundException if server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(service.leave('server-1', 'user-1')).rejects.toThrow('Server not found');
    });

    it('should throw ForbiddenException if user is owner', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: 'server-1', ownerId: 'user-1' });

      await expect(service.leave('server-1', 'user-1')).rejects.toThrow('Owner cannot leave, transfer ownership or delete');
    });
  });
});