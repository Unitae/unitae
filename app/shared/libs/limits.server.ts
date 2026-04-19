import { LimitReachedError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/libs/db.server'

export { LimitReachedError as LimitError }

const LIMIT_COLUMN_MAP = {
  publishers: 'maxPublishers',
  territories: 'maxTerritories',
  users: 'maxUsers',
  boardDocuments: 'maxBoardDocuments',
} as const

type LimitName = keyof typeof LIMIT_COLUMN_MAP

type CongregationLimits = {
  maxPublishers: number | null
  maxTerritories: number | null
  maxUsers: number | null
  maxStorageBytes: bigint | null
  maxBoardDocuments: number | null
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
    switch (name) {
      case 'publishers':
        return this.db.user.count({ where: { isPublisher: true } })
      case 'territories':
        return this.db.territory.count()
      case 'users':
        return this.db.user.count()
      case 'boardDocuments':
        return this.db.boardDocument.count()
    }
  }
}
