import { describe, expect, it } from 'vitest'
import { type ListedScheduleTemplate, scheduleTemplateView } from './schedule-template-view'

const programme: ListedScheduleTemplate = {
  id: 1,
  name: 'Réunion de semaine',
  key: null,
  kind: 'programme',
  items: 15,
  responsibleRole: { id: 7, key: 'vcm', name: 'Responsable VCM' },
  kinds: [{ id: 270, name: 'Réunion Vie et ministère' }],
  schedules: 99,
  rooms: 1,
}
const services: ListedScheduleTemplate = {
  id: 2,
  name: null,
  key: 'services',
  kind: 'duty',
  items: 4,
  responsibleRole: null,
  kinds: [
    { id: 270, name: 'Réunion Vie et ministère' },
    { id: 271, name: 'Réunion du week-end' },
  ],
  schedules: 0,
  rooms: 0,
}
const roles = [{ id: 7, label: 'Responsable VCM' }]

describe('scheduleTemplateView', () => {
  it('names the one kind suggesting it, with its kind tag, content, responsible and who holds the role', () => {
    expect(scheduleTemplateView(programme, roles, new Map([[7, ['Marc DUPONT']]]))).toMatchObject({
      title: 'Réunion de semaine',
      detail: 'Spirituel · 15 parties',
      responsible: 'Responsable VCM',
      suggestedBy: 'Réunion Vie et ministère',
      placeholder: '',
      responsibleRoleId: 7,
      storedRole: null,
      holders: ['Marc DUPONT'],
    })
  })

  it('counts a programme’s rooms once it has rooms in parallel', () => {
    expect(scheduleTemplateView({ ...programme, rooms: 3 }, roles, new Map()).detail).toBe(
      'Spirituel · 15 parties · 3 salles',
    )
  })

  it('reads an unnamed template as its kind once, counts several kinds, and has no holders without a role', () => {
    expect(scheduleTemplateView(services, roles, new Map())).toMatchObject({
      title: 'Services',
      detail: '4 services',
      responsible: null,
      suggestedBy: '2 types',
      name: '',
      placeholder: 'Services',
      holders: null,
    })
    expect(scheduleTemplateView({ ...services, kinds: [] }, roles, new Map()).suggestedBy).toBe('aucun type')
  })

  it('shows a stored role no one may pick any more, and that nobody holds it', () => {
    const identity = { ...programme, responsibleRole: { id: 3, key: 'elder', name: null } }
    const view = scheduleTemplateView(identity, roles, new Map())
    expect(view.storedRole).toEqual({ id: 3, label: view.responsible })
    expect(view.responsible).not.toBe('')
    expect(view.holders).toEqual([])
  })
})
