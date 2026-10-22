import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ServersService } from './servers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Post()
  async create(@Body() dto: CreateServerDto, @Req() req: any) {
    return this.serversService.create(dto.name, req.user.id);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.serversService.findAll(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.serversService.findOne(id, req.user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateServerDto, @Req() req: any) {
    return this.serversService.update(id, dto.name, req.user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.serversService.delete(id, req.user.id);
  }

  @Post(':id/leave')
  async leave(@Param('id') id: string, @Req() req: any) {
    return this.serversService.leave(id, req.user.id);
  }
}
