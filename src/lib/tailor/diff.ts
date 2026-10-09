export type DiffPart = { text: string; type: "same" | "add" | "del" };

// A word plus its trailing whitespace, so whitespace never matches on its own (which interleaves the diff).
const tokens = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
const norm = (t: string) => t.trim();

/**
 * Word-level diff (LCS). Each run of changes is emitted as ONE deletion followed by ONE addition, so the result
 * reads "[old words][new words]" instead of interleaving. Re-joins exactly: same+del = before, same+add = after.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = norm(a[i]) === norm(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out: DiffPart[] = [];
  const push = (text: string, type: DiffPart["type"]) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ text, type });
  };
  let dels = "";
  let adds = "";
  const flush = () => {
    if (dels) push(dels, "del");
    if (adds) push(adds, "add");
    dels = "";
    adds = "";
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) {
      flush();
      // Keep the AFTER spelling/spacing for shared words; the before-join differs only in trailing space of the last word.
      push(b[j], "same");
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) dels += a[i++];
    else adds += b[j++];
  }
  while (i < n) dels += a[i++];
  while (j < m) adds += b[j++];
  flush();
  return out;
}

/** Share of words kept (0–1). Below ~0.5 an inline diff is hard to read; show before/after instead. */
export function similarity(parts: DiffPart[]): number {
  const count = (t: string) => (t.match(/\S+/g) ?? []).length;
  const same = parts.filter((p) => p.type === "same").reduce((n, p) => n + count(p.text), 0);
  const total = parts.reduce((n, p) => n + count(p.text), 0) - same;
  return total <= 0 ? 1 : same / total;
}
