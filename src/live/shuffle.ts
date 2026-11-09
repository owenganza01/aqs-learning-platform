/*
 * I1: per-attempt option order. A deterministic shuffle seeded by the attempt's submission key
 * and the question, so the order is stable while the learner moves between questions and changes
 * with every new attempt. Grading uses option IDs on the server, so order never affects marks.
 */

/** 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 pseudo-random generator: same seed, same sequence. */
function generator(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A new array with the items in an order fixed by `seed` (Fisher-Yates). The input is not changed. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = items.slice()
  const random = generator(hash(seed))
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
