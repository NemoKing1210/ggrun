/**
 * Drizzle schema — the source of truth for the DB types.
 * Split by domain group; each table file re-exports its `$inferSelect` types.
 * `@/db/schema` resolves here (see drizzle.config.ts -> `./db/schema/index.ts`).
 */
export * from "./enums";
export * from "./users";
export * from "./seasons";
export * from "./players";
export * from "./games";
export * from "./moderation";
export * from "./moves";
export * from "./events";
export * from "./settings";
export * from "./relations";