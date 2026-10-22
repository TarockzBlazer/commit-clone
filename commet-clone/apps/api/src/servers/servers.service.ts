import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServersService {
  constructor(private prisma: PrismaService) {}

  async create(name: string, ownerId: string) {
    const server = await this.prisma.server.create({
      data: {
        name,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: 'owner',
          },
        },
      },
      include: {
        members: true,
        owner: { select: { id: true, username: true } },
      },
    });
    return server;
  }

  async findAll(userId: string) {
    return this.prisma.server.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
        owner: { select: { id: true, username: true } },
        channels: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
        owner: { select: { id: true, username: true } },
        channels: true,
      },
    });
    if (!server) throw new NotFoundException('Server not found');
    const isMember = server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');
    return server;
  }

  async update(id: string, name: string, userId: string) {
    const server = await this.findOne(id, userId);
    const isOwner = server.ownerId === userId;
    if (!isOwner) throw new ForbiddenException('Only owner can update server');
    return this.prisma.server.update({
      where: { id },
      data: { name },
      include: { owner: { select: { id: true, username: true } } },
    });
  }

  async delete(id: string, userId: string) {
    const server = await this.findOne(id, userId);
    const isOwner = server.ownerId === userId;
    if (!isOwner) throw new ForbiddenException('Only owner can delete server');
    
    // Delete related records first due to foreign key constraints
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { channel: { serverId: id } } }),
      this.prisma.channelMember.deleteMany({ where: { channel: { serverId: id } } }),
      this.prisma.channel.deleteMany({ where: { serverId: id } }),
      this.prisma.serverMember.deleteMany({ where: { serverId: id } }),
      this.prisma.server.delete({ where: { id } }),
    ]);
    return { message: 'Server deleted successfully' };
  }

  async leave(id: string, userId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.ownerId === userId) throw new ForbiddenException('Owner cannot leave, transfer ownership or delete');
    return this.prisma.serverMember.delete({
      where: { userId_serverId: { userId, serverId: id } },
    });
  }
}
