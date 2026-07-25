import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common'

// Minimum acceptable zxcvbn score (0..4). Anything below is considered too
// guessable, even when it clears the min(8) length gate. Applied to every
// set-password flow; never to login (which must accept already-stored secrets).
export const MIN_PASSWORD_SCORE = 2

// Build the estimator once at module load with the common dictionary/adjacency
// graphs. This module is server-only, so the dictionary weight never reaches
// the client bundle.
const zxcvbn = new ZxcvbnFactory({ dictionary: { ...dictionary }, graphs: adjacencyGraphs })

export interface PasswordStrength {
  score: number
  weak: boolean
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const { score } = zxcvbn.check(password)

  return { score, weak: score < MIN_PASSWORD_SCORE }
}
