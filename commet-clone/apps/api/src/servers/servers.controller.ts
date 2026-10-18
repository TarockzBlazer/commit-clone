import { Controller, Post, Body } from '@nestjs/common';
@Controller('servers')
export class ServersController {
  @Post()
  create(@Body() body: { name: string }) {
    return { id: 'srv_' + Math.random().toString(36).slice(2), name: body.name };
  }
}
