import { LimitReachedError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export { LimitReachedError as LimitError }

const LIMIT_COLUMN_MAP = {
  // The control plane writes to `maxPublishers` (column kept for backward
  // compat); semantically it's "members" — both publishers and ministry-school
  // students count as members. Excludes leavers and anonymized.
  members: 'maxPublishers',
  territories: 'maxTerritories',
  users: 'maxUsers',
  boardDocuments: 'maxBoardDocuments',
  cardOverlays: 'maxCardOverlays',
} as const

type LimitName = keyof typeof LIMIT_COLUMN_MAP

type CounterFn = (db: TransactionClient) => Promise<number>

const LIMIT_COUNTERS: Record<LimitName, CounterFn> = {
  members: db => db.member.count({ where: { leftAt: null, anonymizedAt: null } }),
  territories: db => db.territory.count(),
  users: db => db.userAccount.count(),
  boardDocuments: db => db.boardDocument.count(),
  cardOverlays: db => db.territoryCardOverlay.count(),
}

type CongregationLimits = {
  maxPublishers: number | null
  maxTerritories: number | null
  maxUsers: number | null
  maxStorageBytes: bigint | null
  maxBoardDocuments: number | null
  maxCardOverlays: number | null
}

export class LimitService {
  constructor(
    private db: TransactionClient,
    private limits: CongregationLimits,
  ) {}

  isLimited(name: LimitName): boolean {
    const column = LIMIT_COLUMN_MAP[name]
    return this.limits[column] != null
  }

  async checkWouldGoOverLimit(name: LimitName): Promise<boolean> {
    if (!this.isLimited(name)) return false

    const column = LIMIT_COLUMN_MAP[name]
    const max = this.limits[column]
    if (max == null) return false

    const current = await this.countCurrent(name)
    return current >= max
  }

  async errorIfWouldGoOverLimit(name: LimitName): Promise<void> {
    if (await this.checkWouldGoOverLimit(name)) {
      throw new LimitReachedError(name)
    }
  }

  isStorageLimited(): boolean {
    return this.limits.maxStorageBytes != null
  }

  checkStorageLimit(currentBytes: bigint, additionalBytes: bigint): boolean {
    if (!this.isStorageLimited() || this.limits.maxStorageBytes == null) return false
    return currentBytes + additionalBytes > this.limits.maxStorageBytes
  }

  errorIfStorageOverLimit(currentBytes: bigint, additionalBytes: bigint): void {
    if (this.checkStorageLimit(currentBytes, additionalBytes)) {
      throw new LimitReachedError('storage')
    }
  }

  private countCurrent(name: LimitName): Promise<number> {
    return LIMIT_COUNTERS[name](this.db)
  }
}
