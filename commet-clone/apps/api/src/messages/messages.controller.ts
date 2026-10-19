import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMessageDto } from './dto/message.dto';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  async findAll(@Param('channelId') channelId: string, @Req() req: any) {
    return this.messagesService.findAll(channelId, req.user.id);
  }

  @Post()
  async create(
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
    @Req() req: any,
  ) {
    return this.messagesService.create(channelId, { ...dto, channelId }, req.user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.delete(id, req.user.id);
  }
}
