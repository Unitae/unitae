import type { FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter'

// Prints, at the end of a run, why tests were skipped and which ones only passed on retry. The list
// reporter shows bare counts ("36 skipped", "1 flaky"); this names the reasons and the tests, so a
// gap such as an unseeded role account stays visible in the CI log instead of reading as success.
export default class SkipSummaryReporter implements Reporter {
  private root: Suite | undefined

  onBegin(_config: unknown, suite: Suite): void {
    this.root = suite
  }

  onEnd(_result: FullResult): void {
    if (!this.root) return
    const skipReasons = new Map<string, number>()
    const flaky: string[] = []

    for (const testCase of this.root.allTests()) {
      const outcome = testCase.outcome()
      if (outcome === 'skipped') {
        const reason = skipReason(testCase)
        skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1)
      } else if (outcome === 'flaky') {
        flaky.push(testCase.titlePath().filter(Boolean).join(' › '))
      }
    }

    const lines: string[] = []
    if (skipReasons.size > 0) {
      lines.push('', 'Skipped tests by reason:')
      for (const [reason, count] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${String(count).padStart(3)} × ${reason}`)
      }
    }
    if (flaky.length > 0) {
      lines.push('', `Flaky tests (failed, then passed on retry): ${flaky.length}`)
      for (const title of flaky) lines.push(`  - ${title}`)
    }
    if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
  }
}

function skipReason(testCase: TestCase): string {
  const annotations = [...testCase.annotations, ...(testCase.results.at(-1)?.annotations ?? [])]
  const skip = annotations.find(annotation => annotation.type === 'skip' || annotation.type === 'fixme')
  return skip?.description || 'no reason given (data-dependent skip inside the test)'
}
