import { describe, expect, it } from 'vitest'

import { mayOpenEvent, type ProgrammeViewer, programmeRights } from './programme-access'

// What a reader may do with each programme, the same on the list as on the programme's page: edit and delete it
// (manage the programmes, or run its template), publish it (publish the programmes, or run its template), assign its
// parts (assign parts, or run its template) and its services (assign parts, or run its template or only its services).
// A draft shows only to someone who may act on it.

const READER: ProgrammeViewer = {
  canManage: false,
  canPublish: false,
  canAssign: false,
  programmeTemplateIds: [],
  serviceTemplateIds: [],
}
const midweek = { templateId: 4 }
const freeform = { templateId: null }

describe('programmeRights', () => {
  it('gives a reader of programmes nothing to act on, and no draft', () => {
    expect(programmeRights(midweek, READER)).toEqual({
      canEdit: false,
      canPublish: false,
      canAssignParts: false,
      canAssignServices: false,
      canSeeDraft: false,
    })
  })

  it('gives each congregation-wide right its own action, on every programme', () => {
    expect(programmeRights(freeform, { ...READER, canManage: true })).toMatchObject({
      canEdit: true,
      canPublish: false,
    })
    expect(programmeRights(freeform, { ...READER, canPublish: true })).toMatchObject({
      canEdit: false,
      canPublish: true,
    })
    expect(programmeRights(freeform, { ...READER, canAssign: true })).toMatchObject({
      canEdit: false,
      canAssignParts: true,
      canAssignServices: true,
    })
  })

  it('gives the responsible of a template every action on its programmes, and none on the others', () => {
    const viewer = { ...READER, programmeTemplateIds: [4], serviceTemplateIds: [4] }

    expect(programmeRights(midweek, viewer)).toEqual({
      canEdit: true,
      canPublish: true,
      canAssignParts: true,
      canAssignServices: true,
      canSeeDraft: true,
    })
    expect(programmeRights({ templateId: 5 }, viewer).canSeeDraft).toBe(false)
    expect(programmeRights(freeform, viewer).canSeeDraft).toBe(false)
  })

  it('lets a services responsible assign the services and see the draft, nothing more', () => {
    expect(programmeRights(midweek, { ...READER, serviceTemplateIds: [4] })).toEqual({
      canEdit: false,
      canPublish: false,
      canAssignParts: false,
      canAssignServices: true,
      canSeeDraft: true,
    })
  })

  it('shows drafts to whoever may act on them in any way', () => {
    for (const viewer of [
      { ...READER, canManage: true },
      { ...READER, canPublish: true },
      { ...READER, canAssign: true },
    ]) {
      expect(programmeRights(freeform, viewer).canSeeDraft).toBe(true)
    }
  })
})

describe('mayOpenEvent', () => {
  const none = { canEdit: false, canPublish: false, canAssign: false, canAssignService: false }

  it('opens a published programme to every reader', () => {
    expect(mayOpenEvent('released', none)).toBe(true)
  })

  it('opens a draft only to someone who may act on it', () => {
    expect(mayOpenEvent('draft', none)).toBe(false)
    expect(mayOpenEvent('draft', { ...none, canAssignService: true })).toBe(true)
    expect(mayOpenEvent('draft', { ...none, canPublish: true })).toBe(true)
  })
})
