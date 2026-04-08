import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBeginingDateOfTheocraticYear,
  getCurrentTheocraticYear,
  getEndDateOfTheocraticYear,
  getNextTheocraticYear,
  getPreviousTheocraticYear,
} from './theocratic-year.server'

describe('getBeginingDateOfTheocraticYear', () => {
  it('retourne le 1er septembre de l\'année donnée', () => {
    const result = getBeginingDateOfTheocraticYear(2025)
    // theocraticYear=2025 → new Date(2025, 10, 1) → novembre 2025 → month > 7 → new Date(2025, 8, 1)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(8) // septembre
    expect(result.getDate()).toBe(1)
  })

  it('retourne le 1er septembre pour différentes années', () => {
    const result = getBeginingDateOfTheocraticYear(2023)
    expect(result.getFullYear()).toBe(2023)
    expect(result.getMonth()).toBe(8)
    expect(result.getDate()).toBe(1)
  })

  describe('sans paramètre (date courante)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('retourne septembre de l\'année courante si on est après août', () => {
      // Octobre 2025
      vi.setSystemTime(new Date(2025, 9, 15))
      const result = getBeginingDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(8)
    })

    it('retourne septembre de l\'année précédente si on est avant septembre', () => {
      // Mars 2025
      vi.setSystemTime(new Date(2025, 2, 15))
      const result = getBeginingDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(8)
    })

    it('retourne septembre de l\'année précédente en août (month 7, pas > 7)', () => {
      // Août 2025 → month=7, pas > 7 → année précédente
      vi.setSystemTime(new Date(2025, 7, 15))
      const result = getBeginingDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(8)
    })

    it('retourne septembre de l\'année courante en septembre (month 8, > 7)', () => {
      // Septembre 2025 → month=8, > 7 → année courante
      vi.setSystemTime(new Date(2025, 8, 15))
      const result = getBeginingDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(8)
    })
  })
})

describe('getEndDateOfTheocraticYear', () => {
  it('retourne le 31 août de l\'année suivante pour l\'année donnée', () => {
    const result = getEndDateOfTheocraticYear(2025)
    // theocraticYear=2025 → new Date(2025, 10, 1) → novembre → month > 7 → new Date(2026, 7, 31)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(7) // août
    expect(result.getDate()).toBe(31)
  })

  describe('sans paramètre (date courante)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('retourne août de l\'année suivante si on est après août', () => {
      // Octobre 2025
      vi.setSystemTime(new Date(2025, 9, 15))
      const result = getEndDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2026)
      expect(result.getMonth()).toBe(7)
      expect(result.getDate()).toBe(31)
    })

    it('retourne août de l\'année courante si on est avant septembre', () => {
      // Mars 2025
      vi.setSystemTime(new Date(2025, 2, 15))
      const result = getEndDateOfTheocraticYear()

      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(7)
      expect(result.getDate()).toBe(31)
    })
  })
})

describe('getCurrentTheocraticYear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retourne l\'année courante après septembre', () => {
    vi.setSystemTime(new Date(2025, 9, 15)) // octobre 2025
    expect(getCurrentTheocraticYear()).toBe(2025)
  })

  it('retourne l\'année précédente avant septembre', () => {
    vi.setSystemTime(new Date(2025, 2, 15)) // mars 2025
    expect(getCurrentTheocraticYear()).toBe(2024)
  })
})

describe('getNextTheocraticYear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retourne l\'année théocratique suivante', () => {
    vi.setSystemTime(new Date(2025, 9, 15)) // octobre 2025
    expect(getNextTheocraticYear()).toBe(2026)
  })
})

describe('getPreviousTheocraticYear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retourne l\'année théocratique précédente', () => {
    vi.setSystemTime(new Date(2025, 9, 15)) // octobre 2025
    expect(getPreviousTheocraticYear()).toBe(2024)
  })
})
