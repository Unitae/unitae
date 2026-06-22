type ClustererLike = { render: () => void }

export function createCoalescedRenderer(getClusterer: () => ClustererLike | null) {
  let pending = false
  return function schedule(): void {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      getClusterer()?.render()
    })
  }
}
