import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { PublicInvitesController } from './invites.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [InvitesController, PublicInvitesController],
  providers: [InvitesService, PrismaService],
  exports: [InvitesService],
})
export class InvitesModule {}