import { fonts, hexColors } from '@unitae/tokens'
import type { CSSProperties, ReactNode } from 'react'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'react-email'

// E-mail clients read neither CSS variables nor web fonts reliably: the brand comes in as inline hex values from the
// tokens, and Plex falls back to the reader's system face.
const color = hexColors.light

const textStyle: CSSProperties = { margin: '0 0 14px', fontSize: 15, lineHeight: '24px', color: color.fg }

interface EmailLayoutProps {
  /** The line a mailbox shows after the subject. */
  preview: string
  heading: ReactNode
  /** Why the reader got this e-mail, in small print under a rule. */
  footer: ReactNode
  platformName: string
  children: ReactNode
}

/**
 * Every e-mail the app sends, on the brand: the mark and the sender's name, the heading, the message, and the small
 * print. Left-aligned on a white card, as the app reads.
 */
export function EmailLayout({ preview, heading, footer, platformName, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: '32px 12px', backgroundColor: color.bg, fontFamily: fonts.sans }}>
        <Container
          style={{
            maxWidth: 520,
            margin: '0 auto',
            padding: '28px 28px 24px',
            backgroundColor: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
          }}
        >
          <table role="presentation" cellPadding={0} cellSpacing={0} style={{ marginBottom: 24 }}>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'middle' }}>
                  <EmailMark />
                </td>
                <td style={{ paddingLeft: 9, verticalAlign: 'middle', fontSize: 15, fontWeight: 600, color: color.fg }}>
                  {platformName}
                </td>
              </tr>
            </tbody>
          </table>
          <Heading
            as="h1"
            style={{ margin: '0 0 18px', fontSize: 21, lineHeight: '28px', fontWeight: 600, color: color.fg }}
          >
            {heading}
          </Heading>
          {children}
          <Hr style={{ margin: '24px 0 16px', border: 'none', borderTop: `1px solid ${color.border}` }} />
          <Text style={{ margin: 0, fontSize: 12, lineHeight: '20px', color: color['fg-faint'] }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}

// The mark is four squares, the second a petrol dot (`Mark` in @unitae/ui). Drawn as a table, since mail clients show
// neither inline SVG nor CSS grid, and no image has to be fetched.
const MARK_CELL = 10
const MARK_GAP = 3
const blank: CSSProperties = { padding: 0, fontSize: 0, lineHeight: 0 }

function MarkCell({ dot = false }: { dot?: boolean }) {
  return (
    <td
      style={{
        ...blank,
        width: MARK_CELL,
        height: MARK_CELL,
        borderRadius: dot ? '50%' : 2,
        backgroundColor: dot ? color.accent : color.fg,
      }}
    >
      {'\u00a0'}
    </td>
  )
}

function EmailMark() {
  const gap = <td style={{ ...blank, width: MARK_GAP }}>{'\u00a0'}</td>
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <MarkCell />
          {gap}
          <MarkCell dot />
        </tr>
        <tr>
          <td colSpan={3} style={{ ...blank, height: MARK_GAP }}>
            {'\u00a0'}
          </td>
        </tr>
        <tr>
          <MarkCell />
          {gap}
          <MarkCell />
        </tr>
      </tbody>
    </table>
  )
}

/** A paragraph of the message. */
export function EmailText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={muted ? { ...textStyle, color: color['fg-muted'] } : textStyle}>{children}</Text>
}

/** The one action of the e-mail: the app's primary button. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '22px 0' }}>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          padding: '10px 18px',
          borderRadius: 6,
          backgroundColor: color.primary,
          color: color['primary-fg'],
          fontSize: 15,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {children}
      </Link>
    </Section>
  )
}

/** A link inside the message; `wrap` lets a long address break anywhere instead of widening the card. */
export function EmailLink({ href, children, wrap = false }: { href: string; children: ReactNode; wrap?: boolean }) {
  return (
    <Link
      href={href}
      style={{ color: color['accent-text'], textDecoration: 'underline', ...(wrap ? { wordBreak: 'break-all' } : {}) }}
    >
      {children}
    </Link>
  )
}
