/**
 * The items & effects DSL: entry documents, the vocabulary they are written
 * in, the checks, the compiler and the rule-text generator.
 * Normative: docs/IEE_CONSTRUCTOR_SPEC.md §5–§8, §13–§14.
 */
export * from "./doc";
export * from "./values";
export * from "./runtime";
export * from "./vocabulary";
export * from "./text";
export * from "./scenario-text";
export * from "./scenario-verdict";
export * from "./scenario-games";
export * from "./check";
export * from "./placement";
export * from "./compile";
export * from "./set";
export * from "./tuning";
export * from "./power";
export * from "./play-model";
export * from "./canonical";
export * from "./upgrade";
export { IEE_GLYPHS } from "./glyphs";
export { NOUNS, plural, counted, quote, joinAnd, joinOr, capitalize, sentence } from "./text-kit";
