import { Module } from '@nestjs/common';
import { ServersModule } from './servers/servers.module';
@Module({ imports: [ServersModule] })
export class AppModule {}
