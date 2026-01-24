import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReplicacheModule } from './replicache/replicache.module';
import { User } from './users/user.entity';
import { ReplicacheClient } from './replicache/replicache-client.entity';
import { ReplicacheSpaceVersion } from './replicache/replicache-space-version.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [User, ReplicacheClient, ReplicacheSpaceVersion],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    UsersModule,
    ReplicacheModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
