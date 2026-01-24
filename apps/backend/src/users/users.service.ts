import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(email: string, password: string, name?: string): Promise<User> {
    const user = this.usersRepository.create({ email, password, name, version: 1 });
    return this.usersRepository.save(user);
  }

  async update(userId: string, updates: { name?: string }, newVersion: number): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) {
      return null;
    }

    // Update allowed fields
    if (updates.name !== undefined) {
      user.name = updates.name;
    }

    // Update version for Replicache sync
    user.version = newVersion;

    return this.usersRepository.save(user);
  }

  async findByIdWithMinVersion(userId: string, minVersion: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: {
        id: userId,
        version: MoreThan(minVersion),
      },
    });
  }
}
