import { isIdentityRoleKey, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { ForbiddenError, ValidationError } from '~/shared/errors/app-error.server'

// Invariants for the organigram tree that the database cannot hold.
//
// The composite foreign key on `parentRoleId` already stops a role being parented into
// another congregation — that one is enforced in Postgres, not here. What no constraint can
// express is that A → B → A is a cycle, that the chain must stay finite, and that the two
// auto-synced rosters sit at the top.
//
// Pure functions, no DB: the caller loads the parent's chain and hands over a plain shape,
// following `app/features/events/server/event-status.policy.ts`.

/**
 * Maximum number of levels, counting the root as level 1.
 *
 * A real congregation's "Organisation des services" sheet reaches 7 — collège → comité →
 * coordinateur → audio/vidéo → coordinateur a/v → estrade → responsable estrade. Ten leaves
 * headroom without letting a mis-click build an unbounded chain.
 */
export const MAX_ORGANIGRAM_DEPTH = 10

/**
 * The identity rosters that appear in the chart. They are the roots: on the printed sheet
 * every service ultimately answers to the collège des anciens, and the assistants are a
 * standalone list. Every other identity role is a population, not a position.
 */
export const ORGANIGRAM_ROSTER_KEYS: readonly string[] = ['elder', 'assistant-servant']

export const ROLE_TREE_ERRORS = {
  cycle: 'Ce rôle ne peut pas être placé sous lui-même ou sous l’un de ses sous-rôles.',
  tooDeep: `L’organigramme ne peut pas dépasser ${MAX_ORGANIGRAM_DEPTH} niveaux.`,
  rosterIsRoot: 'Les anciens et les assistants ministériels sont toujours au sommet de l’organigramme.',
  notAnOrganigramRole: 'Ce rôle ne peut pas figurer dans l’organigramme.',
} as const

export interface SetParentInput {
  roleId: number
  roleKey: string
  /**
   * The proposed parent followed by its own ancestors, nearest first. Empty makes the role a
   * root. Supplying the whole chain is what lets the cycle check stay a pure function.
   */
  parentChainIds: number[]
  /** Levels of descendants beneath this role; 0 when it has none. */
  subtreeHeight: number
}

export function assertCanSetParent({ roleId, roleKey, parentChainIds, subtreeHeight }: SetParentInput): void {
  if (ORGANIGRAM_ROSTER_KEYS.includes(roleKey) && parentChainIds.length > 0) {
    throw new ForbiddenError(ROLE_TREE_ERRORS.rosterIsRoot)
  }

  // Covers self-parenting too: the role would appear as the first entry of its own chain.
  if (parentChainIds.includes(roleId)) {
    throw new ValidationError('parentRoleId', ROLE_TREE_ERRORS.cycle)
  }

  // The moved role lands one level below its parent, and drags its descendants with it —
  // checking only the role itself would let a subtree slip past the cap.
  const deepestLevel = parentChainIds.length + 1 + subtreeHeight
  if (deepestLevel > MAX_ORGANIGRAM_DEPTH) {
    throw new ValidationError('parentRoleId', ROLE_TREE_ERRORS.tooDeep)
  }
}

/**
 * Which roles may appear in the chart at all: the two rosters, and any custom role.
 *
 * Deliberately an allowlist rather than "not built-in". Identity roles such as `sister` or
 * `pioneer` describe who someone is, not a post they hold, and `admin` is authority over the
 * software rather than a position in the congregation.
 */
export function canShowInOrganigram(roleKey: string): boolean {
  if (ORGANIGRAM_ROSTER_KEYS.includes(roleKey)) return true
  return !isIdentityRoleKey(roleKey) && !SYSTEM_ROLE_KEYS.includes(roleKey as (typeof SYSTEM_ROLE_KEYS)[number])
}

/** Throwing form for the write path. Shares its rule with the predicate so a picker built on
 * `canShowInOrganigram` can never offer something the service will refuse. */
export function assertCanShowInOrganigram(roleKey: string): void {
  if (!canShowInOrganigram(roleKey)) throw new ForbiddenError(ROLE_TREE_ERRORS.notAnOrganigramRole)
}
