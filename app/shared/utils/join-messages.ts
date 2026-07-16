export function joinMessages(parts: (string | null | undefined | false)[], separator = '\n'): string | null {
  const filtered = parts.filter((part): part is string => Boolean(part))
  return filtered.length === 0 ? null : filtered.join(separator)
}
