import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReplicacheClient } from './replicache-client.entity';
import { ReplicacheSpaceVersion } from './replicache-space-version.entity';
import { PullRequestDto, PushRequestDto } from './dto/replicache.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReplicacheService {
  constructor(
    @InjectRepository(ReplicacheClient)
    private replicacheClientRepository: Repository<ReplicacheClient>,
    @InjectRepository(ReplicacheSpaceVersion)
    private spaceVersionRepository: Repository<ReplicacheSpaceVersion>,
    private usersService: UsersService,
  ) {}

  async pull(userId: string, pullRequest: PullRequestDto) {
    // Get the current space version
    const spaceId = `user-${userId}`;
    let spaceVersion = await this.getSpaceVersion(spaceId);

    // Get client's last mutation ID
    const client = await this.getOrCreateClient(
      pullRequest.clientID,
      userId,
    );

    // Get the cookie (last pulled version)
    const lastPulledVersion = pullRequest.cookie?.version || 0;

    // Return changes since last pull
    const patch: any[] = [];

    // Include user profile if it has been updated
    const user = await this.usersService.findByIdWithMinVersion(userId, lastPulledVersion);
    if (user) {
      patch.push({
        op: 'put',
        key: `user/${user.id}`,
        value: {
          id: user.id,
          email: user.email,
          name: user.name,
          version: user.version,
        },
      });
    }

    // Example: Add your other data entities here
    // const items = await this.itemsRepository.find({
    //   where: { userId, version: MoreThan(lastPulledVersion) }
    // });
    // patch.push(...items.map(item => ({
    //   op: 'put',
    //   key: `item/${item.id}`,
    //   value: item
    // })));

    return {
      cookie: {
        version: spaceVersion,
        clientID: pullRequest.clientID,
      },
      lastMutationID: client.lastMutationId,
      patch,
    };
  }

  async push(userId: string, pushRequest: PushRequestDto) {
    const client = await this.getOrCreateClient(pushRequest.clientID, userId);

    // Process mutations
    for (const mutation of pushRequest.mutations) {
      // Skip if we've already processed this mutation
      if (mutation.id <= client.lastMutationId) {
        continue;
      }

      // Process the mutation based on its name
      await this.processMutation(userId, mutation);

      // Update the client's last mutation ID
      client.lastMutationId = mutation.id;
      await this.replicacheClientRepository.save(client);
    }

    // Increment space version to trigger pulls in other clients
    const spaceId = `user-${userId}`;
    await this.incrementSpaceVersion(spaceId);

    return { success: true };
  }

  private async processMutation(userId: string, mutation: any) {
    // Handle different mutation types
    // This is where you would implement your business logic
    switch (mutation.name) {
      case 'updateUser':
        await this.handleUpdateUser(userId, mutation.args);
        break;
      case 'createItem':
        // Example: await this.itemsService.create(userId, mutation.args);
        break;
      case 'updateItem':
        // Example: await this.itemsService.update(userId, mutation.args);
        break;
      case 'deleteItem':
        // Example: await this.itemsService.delete(userId, mutation.args);
        break;
      default:
        console.warn(`Unknown mutation: ${mutation.name}`);
    }
  }

  private async handleUpdateUser(userId: string, args: any) {
    // Get the new space version for this update
    const spaceId = `user-${userId}`;
    const newVersion = await this.getSpaceVersion(spaceId) + 1;

    // Update the user with the new version
    await this.usersService.update(userId, {
      name: args.name,
    }, newVersion);
  }

  private async getOrCreateClient(
    clientId: string,
    userId: string,
  ): Promise<ReplicacheClient> {
    const id = `${userId}-${clientId}`;
    let client = await this.replicacheClientRepository.findOne({
      where: { id },
    });

    if (!client) {
      client = this.replicacheClientRepository.create({
        id,
        clientId,
        userId,
        lastMutationId: 0,
      });
      await this.replicacheClientRepository.save(client);
    }

    return client;
  }

  private async getSpaceVersion(spaceId: string): Promise<number> {
    const latest = await this.spaceVersionRepository.findOne({
      where: { spaceId },
      order: { version: 'DESC' },
    });

    return latest?.version || 0;
  }

  private async incrementSpaceVersion(spaceId: string): Promise<number> {
    const currentVersion = await this.getSpaceVersion(spaceId);
    const newVersion = currentVersion + 1;

    const spaceVersion = this.spaceVersionRepository.create({
      spaceId,
      version: newVersion,
    });

    await this.spaceVersionRepository.save(spaceVersion);
    return newVersion;
  }
}
