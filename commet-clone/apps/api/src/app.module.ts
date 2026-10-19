import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { GatewayModule } from './gateway/gateway.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [AuthModule, ServersModule, ChannelsModule, MessagesModule, GatewayModule],
  providers: [PrismaService],
})
export class AppModule {}
