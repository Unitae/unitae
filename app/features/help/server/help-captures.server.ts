import type { HelpCaptureManifest } from '~/features/help/model/help-captures'
import manifest from '../content/captures.json'

/**
 * The captures shipped with the app, as `scripts/capture-help.ts` wrote them: per language, each id with its size
 * and date. The image files are in `public/help-captures/`.
 */
export const HELP_CAPTURES: HelpCaptureManifest = manifest
