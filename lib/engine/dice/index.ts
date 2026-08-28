/**
 * Rolls `count` dice with `sides` faces each, using the injected `rng`.
 * Pure: randomness comes exclusively from `rng` ([0, 1) floats).
 */
export function rollDice(count: number, sides: number, rng: () => number): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`dice count must be a non-negative integer, got ${count}`);
  }
  if (!Number.isInteger(sides) || sides < 2) {
    throw new RangeError(`dice sides must be an integer >= 2, got ${sides}`);
  }

  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(rng() * sides) + 1);
  }
  return results;
}
