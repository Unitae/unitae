import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ReplicacheService } from './replicache.service';
import { PullRequestDto, PushRequestDto } from './dto/replicache.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('replicache')
@UseGuards(JwtAuthGuard)
export class ReplicacheController {
  constructor(private replicacheService: ReplicacheService) {}

  @Post('pull')
  async pull(@Request() req: any, @Body() pullRequest: any) {
    const userId = req.user.userId;
    return this.replicacheService.pull(userId, pullRequest as PullRequestDto);
  }

  @Post('push')
  async push(@Request() req: any, @Body() pushRequest: any) {
    const userId = req.user.userId;
    return this.replicacheService.push(userId, pushRequest as PushRequestDto);
  }
}
