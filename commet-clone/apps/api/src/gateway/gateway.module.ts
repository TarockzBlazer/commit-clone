import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WsGateway } from './ws.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [WsGateway, PrismaService],
})
export class GatewayModule {}