import { describe, expect, it } from 'vitest'
import { sanitizeUser } from './sanitize-user.server'

describe('sanitizeUser', () => {
  it('supprime le mot de passe de l\'objet utilisateur', () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      password: 'secret-hash',
      firstname: 'Jean',
      lastname: 'Dupont',
    }

    const result = sanitizeUser(user as never)
    expect(result).not.toHaveProperty('password')
    expect(result).toHaveProperty('id', 1)
    expect(result).toHaveProperty('email', 'test@example.com')
    expect(result).toHaveProperty('firstname', 'Jean')
    expect(result).toHaveProperty('lastname', 'Dupont')
  })

  it('conserve toutes les autres propriétés', () => {
    const user = {
      id: 42,
      email: 'a@b.com',
      password: 'hash',
      active: true,
      isPublisher: false,
      congregationId: 5,
    }

    const result = sanitizeUser(user as never)
    expect(result).toEqual({
      id: 42,
      email: 'a@b.com',
      active: true,
      isPublisher: false,
      congregationId: 5,
    })
  })
})
