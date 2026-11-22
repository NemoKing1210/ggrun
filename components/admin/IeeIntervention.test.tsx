import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { coreRegistry } from "@/lib/modules/iee/registry";

import { IeeIntervention, type CarryingPlayer } from "./IeeIntervention";

vi.mock("@/lib/modules/iee/actions", () => ({
  revokeItemAction: vi.fn(),
  revokeEffectAction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ useActionToast: () => {} }));

const t = getDictionary("en");
const i = t.iee.admin.intervene;

const item = coreRegistry().items()[0]!;
const effect = coreRegistry().effects()[0]!;
const itemKey = item.key;
const effectKey = effect.key;
/** What the page reads from the registry for each instance. */
const asItem = { name: item.names, glyph: item.glyph };
const asEffect = { name: effect.names, glyph: effect.glyph };

function render(carrying: CarryingPlayer[]) {
  return renderToStaticMarkup(
    <I18nProvider locale="en" t={t}>
      <IeeIntervention seasonId="s1" carrying={carrying} t={t} locale="en" />
    </I18nProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("IeeIntervention", () => {
  it("shows the empty state and hides the audit note heading when nobody carries anything", () => {
    const html = render([]);
    expect(html).toContain(i.empty);
    expect(html).toContain(i.emptyHint);
    expect(html).not.toContain(`name="inventoryId"`);
  });

  it("lists carried items and effects with the fields their revoke action needs", () => {
    const html = render([
      {
        seasonPlayerId: "sp1",
        name: "Ada",
        effects: [{ id: "e1", effectKey, polarity: "positive", ...asEffect }],
        items: [
          { id: "i1", itemKey, chargesLeft: 1, ...asItem },
          { id: "i2", itemKey, chargesLeft: 3, ...asItem },
        ],
      },
    ]);
    expect(html).toContain("Ada");
    // Names come with the rows, in the reader's language.
    expect(html).toContain(item.names.en);
    expect(html).toContain(effect.names.en);
    expect(html).toContain(`value="s1"`);
    expect(html).toContain('name="effectId"');
    expect(html).toContain('value="e1"');
    expect(html).toContain('name="inventoryId"');
    expect(html).toContain('value="i1"');
    expect(html).toContain('value="i2"');
    // a multi-charge item shows its remaining charges
    expect(html).toContain("×3");
    // the reason the action requires is mandatory
    expect(html).toContain('name="reason"');
    expect(html).toContain('minLength="5"');
    expect(html).toContain(i.revoke);
  });

  it("keeps the audited note visible while there is something to revoke", () => {
    const html = render([
      { seasonPlayerId: "sp1", name: "Ada", effects: [], items: [{ id: "i1", itemKey, chargesLeft: 1, ...asItem }] },
    ]);
    expect(html).toContain(i.auditedNote);
    expect(html).not.toContain(i.emptyHint);
  });
});
