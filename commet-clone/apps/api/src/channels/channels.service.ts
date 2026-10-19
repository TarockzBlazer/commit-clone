import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private prisma: PrismaService) {}

  async create(serverId: string, name: string, type: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { members: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    const isMember = server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    const channel = await this.prisma.channel.create({
      data: { name, type, serverId },
      include: { server: true },
    });
    return channel;
  }

  async findAll(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { members: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    const isMember = server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    return this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
      include: { server: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    const isMember = channel.server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this channel\'s server');
    return channel;
  }

  async update(id: string, name: string, userId: string) {
    const channel = await this.findOne(id, userId);
    const server = await this.prisma.server.findUnique({
      where: { id: channel.serverId },
    });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === userId;
    if (!isOwner) throw new ForbiddenException('Only owner can update channel');
    return this.prisma.channel.update({
      where: { id },
      data: { name },
    });
  }

  async delete(id: string, userId: string) {
    const channel = await this.findOne(id, userId);
    const server = await this.prisma.server.findUnique({
      where: { id: channel.serverId },
    });
    if (!server) throw new NotFoundException('Server not found');
    const isOwner = server.ownerId === userId;
    if (!isOwner) throw new ForbiddenException('Only owner can delete channel');
    return this.prisma.channel.delete({ where: { id } });
  }
}
