"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BoltIcon,
  ClockIcon,
  GiftIcon,
  MapPinIcon,
  ShieldExclamationIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { HEX_CLIP, IeeArtTile, SQUARE_CLIP } from "@/components/iee/IeeArtTile";
import { Badge } from "@/components/ui/Badge";
import { DebugError } from "@/components/ui/DebugError";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { getEffect, getItem } from "@/lib/engine";
import { useItemAction } from "@/lib/modules/iee/actions";
import { dictText } from "@/lib/i18n/dict-text";

export type InventoryRow = {
  id: string;
  itemKey: string;
  chargesLeft: number;
  source: string;
};

export type StatusRow = {
  id: string;
  effectKey: string;
  polarity: string;
  chargesLeft: number | null;
  rollsLeft: number | null;
  castByUsername: string | null;
};

export type TargetRow = {
  seasonPlayerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  position: number;
  targetable: boolean;
};

/** Cards use the 6px cut, per DESIGN.md §2. */
const CARD_CLIP =
  "[clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]";

/**
 * Remaining duration as a segmented bar.
 *
 * A bare "1 roll left" tells you the number but not the shape of it — one of
 * one reads the same as one of five, and those are very different situations
 * to be in. The total comes from the catalog definition, so the bar shows
 * spent against remaining and the number stops being the only signal.
 *
 * Falls back to the plain string when there is no total to divide by, or when
 * the total is long enough that pips would turn into a hairline comb.
 */
function DurationMeter({
  left,
  total,
  label,
  tone,
}: {
  left: number;
  total: number | null;
  label: string;
  tone: "danger" | "military" | "amber";
}) {
  const fill =
    tone === "danger" ? "bg-danger" : tone === "military" ? "bg-military" : "bg-amber";
  const showPips = total !== null && total > 0 && total <= 8 && left <= total;

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <ClockIcon className="size-3.5 shrink-0 text-dim" aria-hidden />
      {showPips ? (
        <span className="inline-flex items-center gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-1.5 border ${
                i < left ? `${fill} border-transparent` : "border-dim/40 bg-transparent"
              }`}
            />
          ))}
        </span>
      ) : null}
      <span className="ammo-counter text-xs text-zinc-300">{label}</span>
    </span>
  );
}

/** A meta fact in a card footer: small stamped label with its glyph. */
function Meta({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Empty state as empty slots.
 *
 * A single grey sentence in a tall panel reads as a page that failed to load.
 * Drawn slots say what the panel is *for* before the sentence explains it, and
 * they hold the panel's height so the layout does not collapse.
 */
function EmptySlots({ kind, hint }: { kind: "item" | "effect"; hint: string }) {
  const clip = kind === "item" ? SQUARE_CLIP : HEX_CLIP;
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: kind === "item" ? 4 : 3 }, (_, i) => (
          <span
            key={i}
            className={`size-12 border border-dashed border-dim/25 bg-black/20 ${clip}`}
          />
        ))}
      </div>
      <p className="max-w-xs text-center text-sm leading-relaxed text-dim">{hint}</p>
    </div>
  );
}

/** The shared card shell: accent stripe, artwork, header, description, footer. */
function EntryCard({
  tile,
  title,
  badge,
  description,
  footer,
  stripe,
  frame,
}: {
  tile: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  description: string;
  footer: React.ReactNode;
  stripe: string;
  frame: string;
}) {
  return (
    <li className={`relative border ${frame} ${CARD_CLIP}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${stripe}`} aria-hidden />
      <div className="flex items-start gap-3 p-3 pl-4">
        {tile}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-base uppercase leading-tight tracking-wider text-zinc-100">
              {title}
            </h3>
            {badge}
          </div>
          <EntryDescription>{description}</EntryDescription>
          {footer ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-2">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PanelHeading({
  icon: Icon,
  children,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-amber" aria-hidden />
      <h2 className="font-display text-sm uppercase tracking-widest text-amber">{children}</h2>
      {count > 0 && <span className="ammo-counter ml-auto text-xs text-dim">{count}</span>}
    </div>
  );
}

/**
 * Held items and active statuses.
 *
 * The picture leads, the sentence follows, and the footer carries the facts a
 * player acts on — how much of the effect is left, when an item may be used
 * and on whom. Those last two used to be discoverable only by clicking Use and
 * seeing what happened.
 *
 * The target picker only offers players the server would accept — but the flag
 * is a courtesy, not the rule: `activateInventoryItem` re-checks every one of them.
 */
export function InventoryPanel({
  items,
  statuses,
  targets,
  allowTargeting,
}: {
  items: InventoryRow[];
  statuses: StatusRow[];
  targets: TargetRow[];
  allowTargeting: boolean;
}) {
  const { t } = useI18n();
  const p = t.iee.panel;
  const [state, formAction, pending] = useActionState(useItemAction, {});
  const [picking, setPicking] = useState<InventoryRow | null>(null);

  // Close the picker once the action lands, so the list refreshes underneath.
  useEffect(() => {
    if (state.ok) setPicking(null);
  }, [state.ok]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="hud-card p-4">
        <PanelHeading icon={GiftIcon} count={items.length}>
          {p.heading}
        </PanelHeading>

        {items.length === 0 ? (
          <EmptySlots kind="item" hint={p.empty} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((row) => {
              const def = getItem(row.itemKey);
              const active = def?.usage.mode === "active";
              const needsTarget = def?.usage.target === "other" || def?.usage.target === "any";
              const blocked = !allowTargeting && def?.usage.target === "other";

              return (
                <EntryCard
                  key={row.id}
                  frame="border-[#3d3d34] bg-[#1a1a1a]"
                  stripe="bg-amber/70"
                  tile={
                    <IeeArtTile
                      entryKey={row.itemKey}
                      kind="item"
                      heroIcon={def?.heroIcon}
                      size="md"
                    />
                  }
                  title={def ? dictText(t, def.i18n.name) : row.itemKey}
                  badge={
                    <>
                      {row.chargesLeft > 1 && (
                        <Badge variant="amber">
                          {format(p.charges, { count: String(row.chargesLeft) })}
                        </Badge>
                      )}
                      {!active && <Badge variant="military">{p.passive}</Badge>}
                    </>
                  }
                  description={def ? dictText(t, def.i18n.description) : ""}
                  footer={
                    <>
                      {def && (
                        // Vocabulary shared with the catalog: these strings
                        // describe the entry, not the admin screen they were
                        // first written for.
                        <Meta icon={MapPinIcon}>{t.iee.admin.window[def.usage.window]}</Meta>
                      )}
                      {def && needsTarget && (
                        <Meta icon={UserIcon}>{t.iee.admin.target[def.usage.target]}</Meta>
                      )}
                      {active &&
                        (needsTarget ? (
                          <button
                            type="button"
                            className="hud-btn hud-btn-primary ml-auto !px-4 !py-1.5 text-xs"
                            onClick={() => setPicking(row)}
                            disabled={pending || blocked}
                            title={blocked ? p.targetingDisabled : undefined}
                          >
                            {p.use}
                          </button>
                        ) : (
                          <form action={formAction} className="ml-auto">
                            <input type="hidden" name="inventoryId" value={row.id} />
                            <button
                              type="submit"
                              className="hud-btn hud-btn-primary !px-4 !py-1.5 text-xs"
                              disabled={pending}
                            >
                              {p.use}
                            </button>
                          </form>
                        ))}
                    </>
                  }
                />
              );
            })}
          </ul>
        )}

        {state.error && (
          <div className="mt-3">
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
            <DebugError debug={state.debug} title="inventory" />
          </div>
        )}
      </section>

      <section className="hud-card p-4">
        <PanelHeading icon={BoltIcon} count={statuses.length}>
          {p.statusesHeading}
        </PanelHeading>

        {statuses.length === 0 ? (
          <EmptySlots kind="effect" hint={p.statusesEmpty} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {statuses.map((row) => {
              const def = getEffect(row.effectKey);
              const negative = row.polarity === "negative";
              const tone = negative ? "danger" : "military";

              // The catalog's own duration is the denominator — it is what
              // turns "1 left" into "1 of 3 left".
              const totalRolls = def?.duration.kind === "rolls" ? def.duration.value : null;
              const totalCharges = def?.duration.kind === "charges" ? def.duration.value : null;

              return (
                <EntryCard
                  key={row.id}
                  frame={negative ? "border-danger/40 bg-danger/10" : "border-military/40 bg-military/10"}
                  stripe={negative ? "bg-danger" : "bg-military"}
                  tile={
                    <IeeArtTile
                      entryKey={row.effectKey}
                      kind="effect"
                      heroIcon={def?.heroIcon}
                      polarity={negative ? "negative" : "positive"}
                      size="md"
                    />
                  }
                  title={def ? dictText(t, def.i18n.name) : row.effectKey}
                  badge={
                    <Badge variant={negative ? "danger" : "military"}>
                      {negative ? t.iee.polarity.negative : t.iee.polarity.positive}
                    </Badge>
                  }
                  description={def ? dictText(t, def.i18n.description) : ""}
                  footer={
                    <>
                      {row.rollsLeft !== null ? (
                        <DurationMeter
                          left={row.rollsLeft}
                          total={totalRolls}
                          tone={tone}
                          label={format(p.expiresIn, { count: String(row.rollsLeft) })}
                        />
                      ) : row.chargesLeft !== null ? (
                        <DurationMeter
                          left={row.chargesLeft}
                          total={totalCharges}
                          tone={tone}
                          label={format(p.expiresCharges, { count: String(row.chargesLeft) })}
                        />
                      ) : (
                        <Meta icon={ClockIcon}>{p.permanent}</Meta>
                      )}
                      <Meta icon={row.castByUsername ? UserIcon : MapPinIcon}>
                        {row.castByUsername
                          ? format(p.castBy, { name: row.castByUsername })
                          : p.fromCell}
                      </Meta>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={picking !== null} onClose={() => setPicking(null)}>
        <div>
          <h3 className="font-display text-lg uppercase tracking-widest">{p.targetTitle}</h3>
          <p className="mt-1 text-sm text-dim">{p.targetHint}</p>
          <div className="hazard-tape mt-3 opacity-60" aria-hidden />
        </div>

        {targets.length === 0 ? (
          <p className="mt-4 text-sm text-dim">{p.targetNone}</p>
        ) : (
          <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {targets.map((target) => (
              <li key={target.seasonPlayerId}>
                <form action={formAction}>
                  <input type="hidden" name="inventoryId" value={picking?.id ?? ""} />
                  <input
                    type="hidden"
                    name="targetSeasonPlayerId"
                    value={target.seasonPlayerId}
                  />
                  <button
                    type="submit"
                    disabled={pending || !target.targetable}
                    className="flex w-full items-center gap-3 border border-[#3d3d34] bg-[#1a1a1a] p-2 text-left transition-colors hover:border-amber/50 disabled:cursor-not-allowed disabled:opacity-50 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  >
                    <AvatarBadge
                      size="sm"
                      square
                      name={target.displayName ?? target.username}
                      src={target.avatarUrl}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">
                        {target.displayName ?? target.username}
                      </span>
                      <span className="ammo-counter text-[11px] text-dim">#{target.position}</span>
                    </span>
                    {!target.targetable && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-dim">
                        <ShieldExclamationIcon className="size-3.5" aria-hidden />
                        {p.targetProtected}
                      </span>
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {state.error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="hud-btn" onClick={() => setPicking(null)}>
            {p.cancel}
          </button>
        </div>
      </Modal>
    </div>
  );
}
