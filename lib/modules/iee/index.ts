/**
 * Items / Effects / Events — application layer.
 *
 * The pure rules live in `lib/engine/iee`; this layer owns persistence and the
 * staff-facing use-cases. The transactional grant/use services arrive with the
 * wheel (phase 6).
 */
export * from "./repository";
export * from "./service";
