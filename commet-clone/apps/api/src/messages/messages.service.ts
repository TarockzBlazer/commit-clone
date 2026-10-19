import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/message.dto';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    const isMember = channel.server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    return this.prisma.message.findMany({
      where: { channelId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(channelId: string, dto: CreateMessageDto, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: { include: { members: true } } },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    const isMember = channel.server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    const message = await this.prisma.message.create({
      data: {
        content: dto.content,
        channelId,
        userId,
      },
      include: { user: { select: { id: true, username: true } } },
    });
    return message;
  }

  async delete(id: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: { channel: { include: { server: { include: { members: true } } } } },
    });
    if (!message) throw new NotFoundException('Message not found');
    const isMember = message.channel.server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');
    if (message.userId !== userId) {
      const server = await this.prisma.server.findUnique({
        where: { id: message.channel.serverId },
      });
      if (server?.ownerId !== userId) {
        throw new ForbiddenException('Only author or server owner can delete a message');
      }
    }
    return this.prisma.message.delete({ where: { id } });
  }
}
