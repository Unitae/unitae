import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('replicache_clients')
@Index(['userId', 'clientId'])
export class ReplicacheClient {
  @PrimaryColumn()
  id: string;

  @Column()
  clientId: string;

  @Column()
  userId: string;

  @Column({ type: 'integer', default: 0 })
  lastMutationId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
