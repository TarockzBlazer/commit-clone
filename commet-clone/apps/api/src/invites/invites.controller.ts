import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInviteDto, AcceptInviteDto } from './dto/invite.dto';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';

@Controller('servers/:serverId/invites')
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  async create(
    @Param('serverId') serverId: string,
    @Body() dto: CreateInviteDto,
    @Req() req: any,
  ) {
    return this.invitesService.create(serverId, req.user.id, dto);
  }

  @Get()
  async list(@Param('serverId') serverId: string, @Req() req: any) {
    return this.invitesService.listByServer(serverId, req.user.id);
  }

  @Delete(':inviteId')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('serverId') serverId: string, @Param('inviteId') inviteId: string, @Req() req: any) {
    return this.invitesService.delete(inviteId, req.user.id);
  }
}

@Controller('invites')
export class PublicInvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('validate')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async validate(@Body() dto: AcceptInviteDto) {
    const invite = await this.invitesService.findByCode(dto.code);

    // Check if invite is expired
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    // Check if invite has reached max uses
    if (invite.currentUses >= invite.maxUses) {
      throw new BadRequestException('Invite has reached maximum uses');
    }

    return {
      code: invite.code,
      serverName: invite.server.name,
      creatorName: invite.creator.username,
      maxUses: invite.maxUses,
      currentUses: invite.currentUses,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  async accept(@Body() dto: AcceptInviteDto, @Req() req: any) {
    return this.invitesService.accept(dto.code, req.user.id);
  }

  @Get(':code')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async getInfo(@Param('code') code: string) {
    const invite = await this.invitesService.findByCode(code);

    // A public invite preview must not outlive the invite itself, and it never
    // needs to reveal the internal server id. Joining is only possible through
    // POST /invites/accept, which validates and consumes the code atomically.
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }
    if (invite.currentUses >= invite.maxUses) {
      throw new BadRequestException('Invite has reached maximum uses');
    }

    return {
      code: invite.code,
      serverName: invite.server.name,
      creatorName: invite.creator.username,
      maxUses: invite.maxUses,
      currentUses: invite.currentUses,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }
}