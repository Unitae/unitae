import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('replicache_space_versions')
@Index(['spaceId', 'version'])
export class ReplicacheSpaceVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  spaceId: string;

  @Column({ type: 'integer' })
  version: number;

  @CreateDateColumn()
  createdAt: Date;
}
