import { ShieldExclamationIcon } from "@heroicons/react/24/outline";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { revokeEffectAction, revokeItemAction } from "@/lib/modules/iee/actions";
import { FormShell } from "@/components/admin/FormShell";
import { IeeIcon } from "@/components/iee/IeeIcon";
import { Input } from "@/components/ui/Input";

/**
 * What each participant is carrying, and a way for staff to take it back.
 *
 * It sits beside the roster rather than inside it: the roster table is about
 * position, balance and status — one row per participant, always — while this
 * is about the few participants who happen to hold something right now, and it
 * needs two lines per entry rather than one cell.
 *
 * Removal only. Handing an item out is a different act from correcting one and
 * it would have to answer to the season's pool and its caps; a judge who wants
 * to compensate someone can adjust their balance, which is already audited.
 */

export interface CarriedItem {
  id: string;
  itemKey: string;
  chargesLeft: number;
}

export interface CarriedEffect {
  id: string;
  effectKey: string;
  polarity: string;
}

export interface CarryingPlayer {
  seasonPlayerId: string;
  name: string;
  items: CarriedItem[];
  effects: CarriedEffect[];
}

/** Catalog names live in the dictionaries; the tables only store keys. */
function entryName(t: Dictionary, kind: "items" | "effects", key: string): string {
  const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const node = (t.iee as unknown as Record<string, Record<string, { name?: string }>>)[kind]?.[
    camel
  ];
  return node?.name ?? key;
}

function RevokeRow({
  seasonId,
  t,
  kind,
  entryKey,
  hidden,
  action,
  meta,
}: {
  seasonId: string;
  t: Dictionary;
  kind: "item" | "effect";
  entryKey: string;
  /** The id field this form submits, named as its action expects it. */
  hidden: { name: string; value: string };
  action: typeof revokeItemAction;
  meta?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border border-[#2a2a22] bg-background/40 px-2.5 py-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
      <IeeIcon
        kind={kind}
        entryKey={entryKey}
        className={kind === "effect" ? "size-5 text-violet-400" : "size-5 text-amber"}
      />
      <span className="text-base text-zinc-200">
        {entryName(t, kind === "item" ? "items" : "effects", entryKey)}
      </span>
      {meta ? (
        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{meta}</span>
      ) : null}
      <FormShell
        action={action}
        submitLabel={t.iee.admin.intervene.revoke}
        submitClassName="hud-btn hud-btn-danger"
        className="ml-auto flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name={hidden.name} value={hidden.value} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <Input
          name="reason"
          required
          minLength={5}
          placeholder={t.iee.admin.intervene.reasonPlaceholder}
          aria-label={t.iee.admin.intervene.reasonLabel}
          className="w-56"
        />
      </FormShell>
    </div>
  );
}

export function IeeIntervention({
  seasonId,
  carrying,
  t,
}: {
  seasonId: string;
  carrying: CarryingPlayer[];
  t: Dictionary;
}) {
  return (
    <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-2.5">
        <h2 className="inline-flex items-center gap-2 font-display text-xs uppercase tracking-[0.14em] text-amber">
          <span className="inline-flex size-6 items-center justify-center border border-[#3d3d34] bg-raised text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <ShieldExclamationIcon className="size-3.5" aria-hidden />
          </span>
          {t.iee.admin.intervene.title}
        </h2>
        <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">
          {t.iee.admin.intervene.auditedNote}
        </span>
      </div>

      {carrying.length === 0 ? (
        <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <p className="font-mono text-xs uppercase tracking-widest text-dim">
            {t.iee.admin.intervene.empty}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            {t.iee.admin.intervene.emptyHint}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#2a2a22]">
          {carrying.map((p) => (
            <li key={p.seasonPlayerId} className="flex flex-col gap-2 p-4">
              <p className="font-display text-sm uppercase tracking-widest text-zinc-200">
                {p.name}
              </p>
              {p.effects.map((e) => (
                <RevokeRow
                  key={e.id}
                  seasonId={seasonId}
                  t={t}
                  kind="effect"
                  entryKey={e.effectKey}
                  hidden={{ name: "effectId", value: e.id }}
                  action={revokeEffectAction}
                  meta={t.iee.admin.intervene.status}
                />
              ))}
              {p.items.map((i) => (
                <RevokeRow
                  key={i.id}
                  seasonId={seasonId}
                  t={t}
                  kind="item"
                  entryKey={i.itemKey}
                  hidden={{ name: "inventoryId", value: i.id }}
                  action={revokeItemAction}
                  meta={i.chargesLeft > 1 ? `×${i.chargesLeft}` : undefined}
                />
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
