import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/invite.dto';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  async create(serverId: string, creatorId: string, dto: CreateInviteDto) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { members: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const isMember = server.members.some(m => m.userId === creatorId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    // Check if user has permission to create invites (owner or admin)
    const membership = server.members.find(m => m.userId === creatorId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owner or admin can create invites');
    }

    const code = generateInviteCode();
    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60 * 1000)
      : null;

    const invite = await this.prisma.invite.create({
      data: {
        code,
        serverId,
        creatorId,
        maxUses: dto.maxUses ?? 100,
        expiresAt,
      },
      include: {
        server: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
    });

    return invite;
  }

  async findByCode(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        server: {
          include: {
            members: { select: { userId: true, role: true } },
            owner: { select: { id: true, username: true } },
          },
        },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  async validate(code: string, userId: string) {
    const invite = await this.findByCode(code);

    // Check if invite is expired
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    // Check if invite has reached max uses
    if (invite.currentUses >= invite.maxUses) {
      throw new BadRequestException('Invite has reached maximum uses');
    }

    // Check if user is already a member
    const server = await this.prisma.server.findUnique({
      where: { id: invite.serverId },
      include: { members: { where: { userId } } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const isMember = server.members.some(m => m.userId === userId);
    if (isMember) {
      throw new BadRequestException('Already a member of this server');
    }

    return invite;
  }

  async accept(code: string, userId: string) {
    // Validate before entering transaction (expiry, maxUses, membership)
    const invite = await this.validate(code, userId);

    // Atomic increment: only succeeds if currentUses < maxUses.
    // This prevents race conditions where two concurrent accept() calls
    // for a maxUses=1 invite would both increment past the limit.
    const updated = await this.prisma.invite.updateMany({
      where: {
        id: invite.id,
        currentUses: { lt: invite.maxUses },
      },
      data: {
        currentUses: { increment: 1 },
        usedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Invite has reached maximum uses');
    }

    // Create membership inside the same logical flow. The
    // @@unique([userId, serverId]) constraint prevents duplicate
    // memberships for the same user.
    await this.prisma.serverMember.create({
      data: {
        userId,
        serverId: invite.serverId,
        role: 'member',
      },
    });

    const server = await this.prisma.server.findUnique({
      where: { id: invite.serverId },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
        owner: { select: { id: true, username: true } },
        channels: true,
      },
    });

    return server;
  }

  async listByServer(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { members: { where: { userId } } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const isMember = server.members.some(m => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Not a member of this server');

    // Only owner/admin can see all invites
    const membership = server.members.find(m => m.userId === userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owner or admin can view invites');
    }

    return this.prisma.invite.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, username: true } },
      },
    });
  }

  async delete(inviteId: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: { server: { include: { members: true } } },
    });
    if (!invite) throw new NotFoundException('Invite not found');

    const membership = invite.server.members.find(m => m.userId === userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException('Only owner or admin can delete invites');
    }

    await this.prisma.invite.delete({ where: { id: inviteId } });
    return { message: 'Invite deleted successfully' };
  }
}