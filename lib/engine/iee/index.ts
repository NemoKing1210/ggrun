/**
 * Items / Effects / Events — public surface of the IEE subsystem.
 *
 * Pure domain code: selection, hook reduction, the use guards, the reel. The
 * entries themselves are documents compiled by `./dsl` (the core ones live in
 * `./core-docs`); persistence goes through `lib/modules/iee/executor`.
 */
export * from "./selection/gates";
export * from "./selection/pick";
export * from "./selection/simulate";
export * from "./resolve/hooks";
export * from "./reel";
export * from "./use-guards";
export * from "./filter";
export * from "./events";
export * from "./scenarios";
export * from "./catalog";
