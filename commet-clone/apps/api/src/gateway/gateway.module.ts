import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WsGateway } from './ws.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [WsGateway, PrismaService],
})
export class GatewayModule {}