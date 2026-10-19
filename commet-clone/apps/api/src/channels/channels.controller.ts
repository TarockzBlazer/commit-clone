import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';

@Controller('servers/:serverId/channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  async create(
    @Param('serverId') serverId: string,
    @Body() dto: CreateChannelDto,
    @Req() req: any,
  ) {
    return this.channelsService.create(serverId, dto.name, dto.type, req.user.id);
  }

  @Get()
  async findAll(@Param('serverId') serverId: string, @Req() req: any) {
    return this.channelsService.findAll(serverId, req.user.id);
  }

  @Get(':id')
  async findOne(@Param('serverId') serverId: string, @Param('id') id: string, @Req() req: any) {
    return this.channelsService.findOne(id, req.user.id);
  }

  @Put(':id')
  async update(
    @Param('serverId') serverId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
    @Req() req: any,
  ) {
    return this.channelsService.update(id, dto.name, req.user.id);
  }

  @Delete(':id')
  async delete(@Param('serverId') serverId: string, @Param('id') id: string, @Req() req: any) {
    return this.channelsService.delete(id, req.user.id);
  }
}
