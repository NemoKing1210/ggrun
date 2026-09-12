import type { ItemDef, ItemKey } from "../../types/iee";
import {
  cleansingSalve,
  jinx,
  leadWeights,
  lodestone,
  spareDie,
} from "./catalog-items";
import { hexScroll } from "./hex-scroll";

/** The item catalog — see effects/registry.ts for the rationale. */
export const ITEMS: Record<ItemKey, ItemDef> = {
  [hexScroll.key]: hexScroll,
  [cleansingSalve.key]: cleansingSalve,
  [lodestone.key]: lodestone,
  [spareDie.key]: spareDie,
  [leadWeights.key]: leadWeights,
  [jinx.key]: jinx,
};

export function getItem(key: ItemKey): ItemDef | null {
  return ITEMS[key] ?? null;
}

export function listItems(): ItemDef[] {
  return Object.values(ITEMS);
}
