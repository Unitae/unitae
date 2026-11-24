import { describe, expect, it } from 'vitest'
import { publishActionShown } from './publish-action'

describe('publishActionShown, whether the header has a publishing control to draw', () => {
  const none = {
    awaitingProgramme: false,
    canCreateProgramme: false,
    publishAll: null,
    canRelease: false,
    canUnrelease: false,
  }

  it.each([
    // Awaiting its programme, with or without schedules: « Créer le programme » for whoever may create it, nothing else.
    [{ ...none, awaitingProgramme: true, canCreateProgramme: true, publishAll: { count: 0 } }, true],
    [{ ...none, awaitingProgramme: true, canCreateProgramme: true }, true],
    [{ ...none, awaitingProgramme: true, canRelease: true }, false],
    // With schedules: « Tout publier » only while a draft is the reader's to publish.
    [{ ...none, publishAll: { count: 2 } }, true],
    [{ ...none, publishAll: { count: 0 }, canRelease: true }, false],
    // Without schedules: publishing or withdrawing the meeting as a whole.
    [{ ...none, canRelease: true }, true],
    [{ ...none, canUnrelease: true }, true],
    [none, false],
  ])('%o → %s', (input, shown) => {
    expect(publishActionShown(input)).toBe(shown)
  })
})
