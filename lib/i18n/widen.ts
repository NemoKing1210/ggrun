/**
 * Widens dictionary literal types to string: en dictionary values are declared
 * as const, but ru/uk versions only need to be type-safe structurally
 * (same keys), not by identical literals.
 */
export type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};
