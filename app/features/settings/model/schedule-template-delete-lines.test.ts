import { describe, expect, it } from 'vitest'
import { scheduleTemplateDeleteLines } from './schedule-template-delete-lines'

describe('scheduleTemplateDeleteLines', () => {
  it('names the kinds using it, keeps the schedules made from it, and says they lose their responsible', () => {
    expect(
      scheduleTemplateDeleteLines({
        kind: 'duty',
        kinds: ['Réunion de semaine', 'Réunion du week-end'],
        schedules: 312,
        responsible: 'Sono',
      }),
    ).toEqual([
      'Réunion de semaine et Réunion du week-end ne l’utilisent plus : leurs nouvelles réunions arrivent sans ce planning.',
      'Les 312 plannings déjà créés à partir de ce modèle gardent leur nom, leurs services et leurs attributions.',
      'Ils n’ont plus de responsable : ceux qui gèrent les programmes s’en occupent.',
    ])
  })

  it('says one kind and one schedule in the singular, its parts for a programme, and no responsible line without one', () => {
    expect(
      scheduleTemplateDeleteLines({ kind: 'programme', kinds: ['Mémorial'], schedules: 1, responsible: null }),
    ).toEqual([
      'Mémorial ne l’utilise plus : ses nouvelles réunions arrivent sans ce planning.',
      'Le planning déjà créé à partir de ce modèle garde son nom, ses parties et ses attributions.',
    ])
  })

  it('says a template no kind uses and none was made from is offered no more, and nothing else', () => {
    expect(scheduleTemplateDeleteLines({ kind: 'duty', kinds: [], schedules: 0, responsible: 'Sono' })).toEqual([
      'Il n’est plus proposé par « Ajouter un planning ».',
    ])
  })
})
