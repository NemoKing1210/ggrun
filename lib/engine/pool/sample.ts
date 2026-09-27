/**
 * Up to `n` distinct items drawn uniformly at random, in random order.
 *
 * Exists because a provider that returns its whole list in one response
 * (FreeToGame hands back ~400 titles per call) used to be cut down with
 * `slice(0, pageSize)` over a list sorted by popularity — so every roll in an
 * API season saw the same twenty games, and a player could only ever be handed
 * those twenty. Drawing a random window instead lets the season reach the whole
 * catalogue the provider offers.
 *
 * Partial Fisher–Yates over a copy: the input is never mutated, and only the
 * first `n` positions are shuffled. `rng` is injected like everywhere else in
 * the engine, so the draw is reproducible in tests.
 */
export function sampleUniform<T>(items: readonly T[], n: number, rng: () => number): T[] {
  const take = Math.max(0, Math.min(Math.floor(n), items.length));
  const pool = items.slice();
  for (let i = 0; i < take; i++) {
    // min() guards an rng that returns exactly 1, which Math.random never does
    // but a test stub might.
    const j = Math.min(pool.length - 1, i + Math.floor(rng() * (pool.length - i)));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, take);
}
