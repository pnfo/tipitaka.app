/** Myers' O(ND) diff of two sequences: the index pairs [i, j] of the longest common subsequence, in order */
export function lcsPairs<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const n = a.length, m = b.length, max = n + m
  if (!n || !m) return []
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let done = false
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2)) // k = -d-1 .. d+1 of the previous round
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[off + k] = x
      if (x >= n && y >= m) { done = true; break }
    }
  }
  // backtrack: the snakes are the matches
  const pairs: [number, number][] = []
  let x = n, y = m
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d], at = (k: number) => vd[k + d + 1]
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = d === 0 ? 0 : at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY && x > 0 && y > 0) { x--; y--; pairs.push([x, y]) }
    if (d === 0) break
    x = prevX
    y = prevY
  }
  return pairs.reverse()
}
