import { describe, expect, it } from 'vitest'
import { buildLoginRedirectUrl, resolvePostLoginRedirect } from './post-login-redirect.server'

function makeFormData(entries: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }
  return formData
}

describe('resolvePostLoginRedirect', () => {
  it("préfère la valeur du form à celle de l'URL", () => {
    const request = new Request('http://localhost/login?redirectTo=%2Ffrom-url')
    const formData = makeFormData({ redirectTo: '/from-form' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/from-form')
  })

  it("utilise le paramètre d'URL quand le champ de formulaire est absent", () => {
    const request = new Request('http://localhost/login?redirectTo=%2Fterritories%2F1')
    const formData = makeFormData({})

    expect(resolvePostLoginRedirect(request, formData)).toBe('/territories/1')
  })

  it("utilise le paramètre d'URL quand le champ de formulaire est vide", () => {
    const request = new Request('http://localhost/login?redirectTo=%2Fterritories%2F1')
    const formData = makeFormData({ redirectTo: '' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/territories/1')
  })

  it("retourne '/' quand ni le form ni l'URL ne fournissent de redirectTo", () => {
    const request = new Request('http://localhost/login')
    const formData = makeFormData({})

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("retourne '/' quand le paramètre d'URL redirectTo est présent mais vide", () => {
    const request = new Request('http://localhost/login?redirectTo=')
    const formData = makeFormData({})

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("retourne '/' quand le champ de formulaire et le paramètre d'URL sont tous les deux vides", () => {
    const request = new Request('http://localhost/login?redirectTo=')
    const formData = makeFormData({ redirectTo: '' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("rejette une URL protocol-relative (//evil.com) et retombe sur '/'", () => {
    const request = new Request('http://localhost/login')
    const formData = makeFormData({ redirectTo: '//evil.com/path' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("rejette une URL absolue (https://evil.com) et retombe sur '/'", () => {
    const request = new Request('http://localhost/login')
    const formData = makeFormData({ redirectTo: 'https://evil.com/path' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("rejette un chemin ne commençant pas par '/' et retombe sur '/'", () => {
    const request = new Request('http://localhost/login')
    const formData = makeFormData({ redirectTo: 'javascript:alert(1)' })

    expect(resolvePostLoginRedirect(request, formData)).toBe('/')
  })

  it("retombe sur '/' quand request.url est mal formée (ne parvient pas à parser)", () => {
    const badRequest = { url: 'not-a-valid-url' } as unknown as Request
    const formData = makeFormData({})

    expect(resolvePostLoginRedirect(badRequest, formData)).toBe('/')
  })

  it('privilégie la valeur du form même si request.url est mal formée', () => {
    const badRequest = { url: 'not-a-valid-url' } as unknown as Request
    const formData = makeFormData({ redirectTo: '/from-form' })

    expect(resolvePostLoginRedirect(badRequest, formData)).toBe('/from-form')
  })
})

describe('buildLoginRedirectUrl', () => {
  it("retourne '/login' sans query quand la cible est '/'", () => {
    expect(buildLoginRedirectUrl('/')).toBe('/login')
  })

  it('encode la cible dans le paramètre redirectTo', () => {
    expect(buildLoginRedirectUrl('/territories/1?x=2')).toBe('/login?redirectTo=%2Fterritories%2F1%3Fx%3D2')
  })

  it('encode les caractères spéciaux (unicode, espaces)', () => {
    expect(buildLoginRedirectUrl('/territoires/été 42')).toBe('/login?redirectTo=%2Fterritoires%2F%C3%A9t%C3%A9%2042')
  })
})
