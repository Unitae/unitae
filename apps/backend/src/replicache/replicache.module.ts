import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReplicacheController } from './replicache.controller';
import { ReplicacheService } from './replicache.service';
import { ReplicacheClient } from './replicache-client.entity';
import { ReplicacheSpaceVersion } from './replicache-space-version.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReplicacheClient, ReplicacheSpaceVersion]),
    UsersModule,
  ],
  controllers: [ReplicacheController],
  providers: [ReplicacheService],
  exports: [ReplicacheService],
})
export class ReplicacheModule {}
