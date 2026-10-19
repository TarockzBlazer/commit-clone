import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ServersController],
  providers: [ServersService, PrismaService],
  exports: [ServersService],
})
export class ServersModule {}
