export type DiffLineType = 'context' | 'add' | 'del' | 'meta'

export type DiffLine = {
  type: DiffLineType
  /** Line number in the old file, null for added lines. */
  oldNo: number | null
  /** Line number in the new file, null for removed lines. */
  newNo: number | null
  text: string
}

export type DiffHunk = {
  header: string
  lines: DiffLine[]
}

export type ParsedDiff = {
  hunks: DiffHunk[]
  additions: number
  deletions: number
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/**
 * Parses `git diff` output into hunks with real line numbers on both sides.
 *
 * Everything before the first @@ is file-level noise (`diff --git`, `index`,
 * `---`, `+++`) that the panel already shows in its header, so it is dropped.
 */
export function parseDiff(text: string): ParsedDiff {
  const out: ParsedDiff = { hunks: [], additions: 0, deletions: 0 }
  if (!text) return out

  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = HUNK.exec(raw)
    if (m) {
      hunk = { header: raw, lines: [] }
      out.hunks.push(hunk)
      oldNo = parseInt(m[1], 10)
      newNo = parseInt(m[3], 10)
      continue
    }
    if (!hunk) continue

    if (raw.startsWith('+')) {
      hunk.lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: raw.slice(1) })
      out.additions++
    } else if (raw.startsWith('-')) {
      hunk.lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: raw.slice(1) })
      out.deletions++
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" belongs to the line above it.
      hunk.lines.push({ type: 'meta', oldNo: null, newNo: null, text: raw })
    } else if (raw.startsWith(' ') || raw === '') {
      // A truncated diff can end mid-hunk with an empty line; treat it as
      // context rather than dropping it.
      hunk.lines.push({ type: 'context', oldNo: oldNo++, newNo: newNo++, text: raw.slice(1) })
    }
  }

  return out
}
