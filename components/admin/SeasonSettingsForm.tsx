"use client";

import { useActionState, useState } from "react";
import { updateSeasonSettingsAction } from "@/lib/use-cases/admin-actions";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Range } from "@/components/ui/Range";
import { useI18n } from "@/lib/i18n/client";

import { format } from "@/lib/i18n/format";
import { DebugError } from "@/components/ui/DebugError";
import type { SeasonConfig } from "@/game-engine/types";
import { GAME_POOL_TEMPLATES } from "@/lib/game-pool/templates";
import {
  PLATFORMS,
  GENRES,
  TAGS,
  ESRB,
  ORDERINGS,
  GAME_POOL_SOURCES,
  GAME_PROVIDERS,
  BOARD_DISTRIBUTIONS,
} from "@/lib/game-pool/constants";

type Props = {
  seasonId: string;
  initialConfig: SeasonConfig;
  initialRulesMd: string | null;
};

export default function SeasonSettingsForm({ seasonId, initialConfig, initialRulesMd }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"templates" | "dice" | "board" | "pool">("templates");
  const [cfg, setCfg] = useState<SeasonConfig>(initialConfig);
  const [rulesMd, setRulesMd] = useState(initialRulesMd ?? "");
  const templates = GAME_POOL_TEMPLATES;
  const [state, formAction, pending] = useActionState(updateSeasonSettingsAction, {});
  const boardTotalSpecials = cfg.board.bonusCount + cfg.board.penaltyCount + cfg.board.teleportCount + cfg.board.eventCount;
  const boardNormal = Math.max(0, cfg.board.size - boardTotalSpecials - (cfg.board.loop ? 1 : 2));
  const boardValid = boardTotalSpecials <= cfg.board.size - (cfg.board.loop ? 1 : 2);

  const setBoard = (patch: Partial<SeasonConfig["board"]>) =>
    setCfg((c) => ({ ...c, board: { ...c.board, ...patch } }));
  const setDice = (patch: Partial<SeasonConfig["dice"]>) =>
    setCfg((c) => ({ ...c, dice: { ...c.dice, ...patch } }));
  const setPoints = (patch: Partial<SeasonConfig["points"]>) =>
    setCfg((c) => ({ ...c, points: { ...c.points, ...patch } }));
  const setRerolls = (patch: Partial<SeasonConfig["rerolls"]>) =>
    setCfg((c) => ({ ...c, rerolls: { ...c.rerolls, ...patch } }));
  const setGamePool = (patch: Partial<SeasonConfig["gamePool"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, ...patch } }));
  const setFilters = (patch: Partial<SeasonConfig["gamePool"]["filters"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, filters: { ...c.gamePool.filters, ...patch } } }));
  const setCatalog = (patch: Partial<SeasonConfig["gamePool"]["catalog"]>) =>
    setCfg((c) => ({ ...c, gamePool: { ...c.gamePool, catalog: { ...c.gamePool.catalog, ...patch } } }));

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setCfg((c) => ({
      ...c,
      gamePool: {
        ...c.gamePool,
        templateId: id,
        filters: {
          ...c.gamePool.filters,
          genres: tpl.filters.genres ?? c.gamePool.filters.genres,
          tags: tpl.filters.tags ?? c.gamePool.filters.tags,
          platforms: tpl.filters.platforms ?? c.gamePool.filters.platforms,
          esrb: tpl.filters.esrb ?? c.gamePool.filters.esrb,
          yearMin: (tpl.filters.yearMin as number | null) ?? c.gamePool.filters.yearMin,
          yearMax: (tpl.filters.yearMax as number | null) ?? c.gamePool.filters.yearMax,
          ordering: tpl.filters.ordering ?? c.gamePool.filters.ordering,
        },
      },
      board: tpl.boardHint
        ? {
            ...c.board,
            bonusCount: tpl.boardHint.bonusCount,
            penaltyCount: tpl.boardHint.penaltyCount,
            eventCount: tpl.boardHint.eventCount,
          }
        : c.board,
    }));
    setActiveTab("pool");
  };

  const clearTemplate = () => setGamePool({ templateId: null });

  const handleSubmit = (formData: FormData) => {
    formData.set("structured", "1");
    formData.set("seasonId", seasonId);
    formData.set("rulesMd", rulesMd);
    formData.set("dice_sides", String(cfg.dice.sides));
    formData.set("dice_passDiceCount", String(cfg.dice.passDiceCount));
    formData.set("dice_dropDiceCount", String(cfg.dice.dropDiceCount));
    formData.set("dice_dropStreakMultiplier", cfg.dice.dropStreakMultiplier ? "true" : "false");
    formData.set("points_startingBalance", String(cfg.points.startingBalance));
    formData.set("points_bonusAddsToRollOnPass", cfg.points.bonusAddsToRollOnPass ? "true" : "false");
    formData.set("points_resetBalanceAfterUse", cfg.points.resetBalanceAfterUse ? "true" : "false");
    formData.set("board_size", String(cfg.board.size));
    formData.set("board_loop", cfg.board.loop ? "true" : "false");
    formData.set("board_bonusCount", String(cfg.board.bonusCount));
    formData.set("board_penaltyCount", String(cfg.board.penaltyCount));
    formData.set("board_teleportCount", String(cfg.board.teleportCount));
    formData.set("board_eventCount", String(cfg.board.eventCount));
    formData.set("board_distribution", cfg.board.distribution);
    formData.set("board_regenerateOnSave", cfg.board.regenerateOnSave ? "true" : "false");
    formData.set("rerolls_allowed", cfg.rerolls.allowed ? "true" : "false");
    formData.set("rerolls_limitPerGame", String(cfg.rerolls.limitPerGame));
    formData.set("gamePool_source", cfg.gamePool.source);
    formData.set("gamePool_provider", cfg.gamePool.provider);
    formData.set("gamePool_templateId", cfg.gamePool.templateId ?? "");
    formData.set("gamePool_maxCandidates", String(cfg.gamePool.maxCandidates));
    formData.set("gamePool_cacheTtlHours", String(cfg.gamePool.cacheTtlHours));
    formData.set("gamePool_autoFetchOnRoll", cfg.gamePool.autoFetchOnRoll ? "true" : "false");
    formData.set("catalog_allowManualAdd", cfg.gamePool.catalog.allowManualAdd ? "true" : "false");
    formData.set("catalog_fallbackToCatalog", cfg.gamePool.catalog.fallbackToCatalog ? "true" : "false");
    formData.set("genres", JSON.stringify(cfg.gamePool.filters.genres));
    formData.set("platforms", JSON.stringify(cfg.gamePool.filters.platforms));
    formData.set("tags", JSON.stringify(cfg.gamePool.filters.tags));
    formData.set("esrb", JSON.stringify(cfg.gamePool.filters.esrb));
    formData.set("filters_metacriticMin", cfg.gamePool.filters.metacriticMin?.toString() ?? "");
    formData.set("filters_metacriticMax", cfg.gamePool.filters.metacriticMax?.toString() ?? "");
    formData.set("filters_ratingMin", cfg.gamePool.filters.ratingMin?.toString() ?? "");
    formData.set("filters_ratingMax", cfg.gamePool.filters.ratingMax?.toString() ?? "");
    formData.set("filters_yearMin", cfg.gamePool.filters.yearMin?.toString() ?? "");
    formData.set("filters_yearMax", cfg.gamePool.filters.yearMax?.toString() ?? "");
    formData.set("filters_players", cfg.gamePool.filters.players);
    formData.set("filters_onlyWithCover", cfg.gamePool.filters.onlyWithCover ? "true" : "false");
    formData.set("filters_ordering", cfg.gamePool.filters.ordering);
    formData.set("filters_searchQuery", cfg.gamePool.filters.searchQuery ?? "");
    formData.set("filters_ordering", cfg.gamePool.filters.ordering);
    return formAction(formData);
  };

  const TabButton = ({ id, label }: { id: typeof activeTab; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 text-sm font-display uppercase tracking-wider border-b-2 transition ${
        activeTab === id ? "border-amber text-amber bg-amber/10" : "border-transparent text-zinc-400 hover:text-amber"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <div className="hud-card overflow-hidden p-0">
        <div className="flex flex-wrap border-b border-zinc-800 bg-[#0f0f0f]">
          <TabButton id="templates" label={t.admin.settings.tabs.templates} />
          <TabButton id="dice" label={t.admin.settings.tabs.dice} />
          <TabButton id="board" label={t.admin.settings.tabs.board} />
          <TabButton id="pool" label={t.admin.settings.tabs.pool} />
        </div>

        <div className="p-5">
          {activeTab === "templates" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase tracking-wider">{t.admin.settings.templatesHeading}</h3>
                {cfg.gamePool.templateId && (
                  <button type="button" onClick={clearTemplate} className="text-xs text-amber underline underline-offset-4">
                    {t.admin.settings.clearTemplate}
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-400">{t.admin.settings.templatesHint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={`hud-lift text-left p-4 border-2 group [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${
                      cfg.gamePool.templateId === tpl.id
                        ? "border-amber bg-amber/10 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                        : "border-zinc-800 bg-[#151515] hover:border-amber/40 hover:bg-[#1c1c1c]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{tpl.icon}</span>
                      <span className="font-display uppercase tracking-wider text-sm">{tpl.label}</span>
                      {cfg.gamePool.templateId === tpl.id && <Badge variant="amber" size="sm" className="ml-auto">{t.admin.settings.activeBadge}</Badge>}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{tpl.description}</p>
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {(tpl.filters.genres ?? []).slice(0, 3).map((g) => (
                        <Badge key={g} variant="neutral" size="sm">{g}</Badge>
                      ))}
                      {(tpl.filters.tags ?? []).slice(0, 3).map((tg) => (
                        <Badge key={tg} variant="amber" size="sm">{tg}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "dice" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="hud-card p-4 bg-[#0f0f0f] border-zinc-800">
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">{t.admin.settings.diceHeading}</h4>
                <div className="flex flex-col gap-4">
                  <Field label={t.admin.settings.sidesPerDieLabel}>
                    <Range min={2} max={20} value={cfg.dice.sides} onChange={(e) => setDice({ sides: Number(e.target.value) })} />
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>2</span>
                      <span className="text-amber font-bold text-sm">d{cfg.dice.sides}</span>
                      <span>20</span>
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t.admin.settings.diceOnPassLabel}>
                      <Input type="number" min={0} max={5} value={cfg.dice.passDiceCount} onChange={(e) => setDice({ passDiceCount: Number(e.target.value) })} />
                    </Field>
                    <Field label={t.admin.settings.diceOnDropLabel}>
                      <Input type="number" min={0} max={5} value={cfg.dice.dropDiceCount} onChange={(e) => setDice({ dropDiceCount: Number(e.target.value) })} />
                    </Field>
                  </div>
                  <Switch
                    checked={cfg.dice.dropStreakMultiplier}
                    onChange={(v) => setDice({ dropStreakMultiplier: v })}
                    label={t.admin.settings.streakMultiplierLabel}
                    description={t.admin.settings.streakMultiplierDescription}
                  />
                  <div className="hud-card p-3 bg-black/30 text-xs text-zinc-400">
                    {format(t.admin.settings.movementInfo, {
                      balance: cfg.points.bonusAddsToRollOnPass ? " + balance" : "",
                      streak: cfg.dice.dropStreakMultiplier ? " × streak" : "",
                    })}
                  </div>
                </div>
              </section>

              <section className="hud-card p-4 bg-[#0f0f0f] border-zinc-800">
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">{t.admin.settings.pointsHeading}</h4>
                <div className="flex flex-col gap-4">
                  <Field label={t.admin.settings.startingBalanceLabel}>
                    <Input type="number" min={0} value={cfg.points.startingBalance} onChange={(e) => setPoints({ startingBalance: Number(e.target.value) })} />
                  </Field>
                  <Switch
                    checked={cfg.points.bonusAddsToRollOnPass}
                    onChange={(v) => setPoints({ bonusAddsToRollOnPass: v })}
                    label={t.admin.settings.bonusOnPassLabel}
                    description={t.admin.settings.bonusOnPassDescription}
                  />
                  <Switch
                    checked={cfg.points.resetBalanceAfterUse}
                    onChange={(v) => setPoints({ resetBalanceAfterUse: v })}
                    label={t.admin.settings.resetBalanceLabel}
                    description={t.admin.settings.resetBalanceDescription}
                  />
                  <div className="h-px bg-zinc-800 my-1" />
                  <Switch
                    checked={cfg.rerolls.allowed}
                    onChange={(v) => setRerolls({ allowed: v })}
                    label={t.admin.settings.allowRerollsLabel}
                    description={t.admin.settings.allowRerollsDescription}
                  />
                  <Field label={t.admin.settings.rerollsLimitLabel}>
                    <Input type="number" min={0} max={5} value={cfg.rerolls.limitPerGame} onChange={(e) => setRerolls({ limitPerGame: Number(e.target.value) })} disabled={!cfg.rerolls.allowed} />
                  </Field>
                </div>
              </section>
            </div>
          )}

          {activeTab === "board" && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Field label={t.admin.settings.boardSizeLabel}>
                  <Range min={10} max={100} value={cfg.board.size} onChange={(e) => setBoard({ size: Number(e.target.value) })} />
                  <span className="text-amber font-mono text-center text-lg block">{cfg.board.size}</span>
                </Field>
                <Field label={t.admin.settings.distributionLabel}>
                  <Select value={cfg.board.distribution} onChange={(e) => setBoard({ distribution: e.target.value as SeasonConfig["board"]["distribution"] })}>
                    {BOARD_DISTRIBUTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="mt-6">
                  <Switch
                    checked={cfg.board.loop}
                    onChange={(v) => setBoard({ loop: v })}
                    label={t.admin.settings.loopLabel}
                    description={t.admin.settings.loopDescription}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: "bonusCount", label: t.admin.settings.bonusCellsLabel, variant: "emerald" as const },
                  { key: "penaltyCount", label: t.admin.settings.penaltyCellsLabel, variant: "danger" as const },
                  { key: "teleportCount", label: t.admin.settings.teleportsLabel, variant: "violet" as const },
                  { key: "eventCount", label: t.admin.settings.eventCellsLabel, variant: "sky" as const },
                ].map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type="number"
                      min={0}
                      max={cfg.board.size}
                      value={cfg.board[f.key as keyof SeasonConfig["board"]] as number}
                      onChange={(e) => setBoard({ [f.key]: Number(e.target.value) } as never)}
                    />
                    <div className="h-1.5 bg-zinc-800 overflow-hidden [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]">
                      <div
                        className={`h-full ${f.variant === "emerald" ? "bg-emerald-500" : f.variant === "danger" ? "bg-red-500" : f.variant === "violet" ? "bg-violet-500" : "bg-sky-500"}`}
                        style={{
                          width: `${Math.min(100, ((cfg.board[f.key as keyof SeasonConfig["board"]] as number) / cfg.board.size) * 100)}%`,
                        }}
                      />
                    </div>
                  </Field>
                ))}
              </div>

              {!boardValid && (
                <div className="hud-card p-3 bg-red-950/30 border-red-800 text-sm text-red-300">
                  {format(t.admin.settings.capacityWarning, {
                    count: boardTotalSpecials,
                    capacity: cfg.board.size - (cfg.board.loop ? 1 : 2),
                  })}
                </div>
              )}

              <div className="hud-card p-3 bg-black/20 text-xs">
                <div className="flex gap-1.5 mb-1 flex-wrap">
                  <Badge variant="neutral" size="sm">{t.admin.settings.badgeStart}</Badge>
                  <Badge variant="emerald" size="sm">{format(t.admin.settings.badgeBonus, { count: cfg.board.bonusCount })}</Badge>
                  <Badge variant="danger" size="sm">{format(t.admin.settings.badgePenalty, { count: cfg.board.penaltyCount })}</Badge>
                  <Badge variant="violet" size="sm">{format(t.admin.settings.badgeTeleport, { count: cfg.board.teleportCount })}</Badge>
                  <Badge variant="sky" size="sm">{format(t.admin.settings.badgeEvent, { count: cfg.board.eventCount })}</Badge>
                  <Badge variant="dim" size="sm">{format(t.admin.settings.badgeNormal, { count: boardNormal })}</Badge>
                  {!cfg.board.loop && <Badge variant="amber" size="sm">{t.admin.settings.badgeFinish}</Badge>}
                </div>
                <div className="h-2 overflow-hidden flex [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <div style={{ flex: cfg.board.loop ? 1 : 1 }} className="bg-zinc-600" />
                  {cfg.board.bonusCount > 0 && <div style={{ flex: cfg.board.bonusCount }} className="bg-emerald-500" />}
                  {cfg.board.penaltyCount > 0 && <div style={{ flex: cfg.board.penaltyCount }} className="bg-red-500" />}
                  {cfg.board.teleportCount > 0 && <div style={{ flex: cfg.board.teleportCount }} className="bg-violet-500" />}
                  {cfg.board.eventCount > 0 && <div style={{ flex: cfg.board.eventCount }} className="bg-sky-500" />}
                  <div style={{ flex: boardNormal }} className="bg-zinc-800" />
                  {!cfg.board.loop && <div style={{ flex: 1 }} className="bg-amber" />}
                </div>
                <div className="mt-3">
                  <Switch
                    checked={cfg.board.regenerateOnSave}
                    onChange={(v) => setBoard({ regenerateOnSave: v })}
                    label={t.admin.settings.regenerateLabel}
                    description={t.admin.settings.regenerateDescription}
                    variant="danger"
                  />
                </div>
                {cfg.board.regenerateOnSave && (
                  <p className="text-xs text-danger/90 mt-2 border border-danger/30 bg-danger/10 p-2 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">⚠️ {t.admin.settings.regenerateWarning}</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "pool" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Field label={t.admin.settings.sourceLabel}>
                  <Select value={cfg.gamePool.source} onChange={(e) => setGamePool({ source: e.target.value as SeasonConfig["gamePool"]["source"] })}>
                    {GAME_POOL_SOURCES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.admin.settings.providerLabel}>
                  <Select value={cfg.gamePool.provider} onChange={(e) => setGamePool({ provider: e.target.value as SeasonConfig["gamePool"]["provider"] })} disabled={cfg.gamePool.source === "catalog"}>
                    {GAME_PROVIDERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.admin.settings.orderingLabel}>
                  <Select value={cfg.gamePool.filters.ordering} onChange={(e) => setFilters({ ordering: e.target.value })}>
                    {ORDERINGS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterGenres}</span>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <Chip key={g.value} active={cfg.gamePool.filters.genres.includes(g.value)} onClick={() => setFilters({ genres: cfg.gamePool.filters.genres.includes(g.value) ? cfg.gamePool.filters.genres.filter((x) => x !== g.value) : [...cfg.gamePool.filters.genres, g.value] })}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterPlatforms}</span>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => (
                    <Chip key={p.value} active={cfg.gamePool.filters.platforms.includes(p.value)} onClick={() => setFilters({ platforms: cfg.gamePool.filters.platforms.includes(p.value) ? cfg.gamePool.filters.platforms.filter((x) => x !== p.value) : [...cfg.gamePool.filters.platforms, p.value] })}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterTags}</span>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tg) => (
                    <Chip key={tg.value} active={cfg.gamePool.filters.tags.includes(tg.value)} onClick={() => setFilters({ tags: cfg.gamePool.filters.tags.includes(tg.value) ? cfg.gamePool.filters.tags.filter((x) => x !== tg.value) : [...cfg.gamePool.filters.tags, tg.value] })}>
                      {tg.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label={t.admin.settings.metaMinLabel}>
                  <Input type="number" placeholder="—" min={0} max={100} value={cfg.gamePool.filters.metacriticMin ?? ""} onChange={(e) => setFilters({ metacriticMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.metaMaxLabel}>
                  <Input type="number" placeholder="—" min={0} max={100} value={cfg.gamePool.filters.metacriticMax ?? ""} onChange={(e) => setFilters({ metacriticMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.ratingMinLabel}>
                  <Input type="number" step={0.1} placeholder="—" min={0} max={5} value={cfg.gamePool.filters.ratingMin ?? ""} onChange={(e) => setFilters({ ratingMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.ratingMaxLabel}>
                  <Input type="number" step={0.1} placeholder="—" min={0} max={5} value={cfg.gamePool.filters.ratingMax ?? ""} onChange={(e) => setFilters({ ratingMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label={t.admin.settings.yearMinLabel}>
                  <Input type="number" placeholder="—" value={cfg.gamePool.filters.yearMin ?? ""} onChange={(e) => setFilters({ yearMin: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.yearMaxLabel}>
                  <Input type="number" placeholder="—" value={cfg.gamePool.filters.yearMax ?? ""} onChange={(e) => setFilters({ yearMax: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.playersLabel}>
                  <Select value={cfg.gamePool.filters.players} onChange={(e) => setFilters({ players: e.target.value as SeasonConfig["gamePool"]["filters"]["players"] })}>
                    <option value="any">{t.admin.settings.playersAny}</option>
                    <option value="single">{t.admin.settings.playersSingle}</option>
                    <option value="multi">{t.admin.settings.playersMulti}</option>
                    <option value="coop">{t.admin.settings.playersCoop}</option>
                  </Select>
                </Field>
                <Field label={t.admin.settings.searchQueryLabel}>
                  <Input type="text" placeholder="e.g. elden ring" value={cfg.gamePool.filters.searchQuery ?? ""} onChange={(e) => setFilters({ searchQuery: e.target.value || null })} />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-display uppercase tracking-widest text-[11px] text-zinc-400">{t.admin.settings.filterEsrb}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ESRB.map((e) => (
                    <Chip key={e.value} active={cfg.gamePool.filters.esrb.includes(e.value)} onClick={() => setFilters({ esrb: cfg.gamePool.filters.esrb.includes(e.value) ? cfg.gamePool.filters.esrb.filter((x) => x !== e.value) : [...cfg.gamePool.filters.esrb, e.value] })}>
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 hud-card p-3 bg-black/20">
                <Switch checked={cfg.gamePool.filters.onlyWithCover} onChange={(v) => setFilters({ onlyWithCover: v })} label={t.admin.settings.onlyWithCoverLabel} description={t.admin.settings.onlyWithCoverDescription} />
                <Switch checked={cfg.gamePool.autoFetchOnRoll} onChange={(v) => setGamePool({ autoFetchOnRoll: v })} label={t.admin.settings.autoFetchLabel} description={t.admin.settings.autoFetchDescription} />
                <Switch checked={cfg.gamePool.catalog.allowManualAdd} onChange={(v) => setCatalog({ allowManualAdd: v })} label={t.admin.settings.manualAddLabel} description={t.admin.settings.manualAddDescription} />
                <Switch checked={cfg.gamePool.catalog.fallbackToCatalog} onChange={(v) => setCatalog({ fallbackToCatalog: v })} label={t.admin.settings.fallbackLabel} description={t.admin.settings.fallbackDescription} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t.admin.settings.maxCandidatesLabel}>
                  <Input type="number" min={1} max={100} value={cfg.gamePool.maxCandidates} onChange={(e) => setGamePool({ maxCandidates: Number(e.target.value) })} />
                </Field>
                <Field label={t.admin.settings.cacheTtlLabel}>
                  <Input type="number" min={0} max={720} value={cfg.gamePool.cacheTtlHours} onChange={(e) => setGamePool({ cacheTtlHours: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="hud-card p-4">
        <h3 className="font-display uppercase tracking-wider text-amber mb-2">{t.admin.settings.rulesLabel}</h3>
        <Textarea value={rulesMd} onChange={(e) => setRulesMd(e.target.value)} rows={6} placeholder={t.admin.settings.rulesPlaceholder} />
      </section>

      {state?.error && <DebugError debug={state?.debug} title="season settings" />}
      {state?.ok && <div className="hud-card p-3 bg-emerald-950/30 border-emerald-800 text-sm text-emerald-300 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">{state.ok}</div>}

      <div className="flex gap-3 justify-end">
        <button type="submit" disabled={pending || !boardValid} className="hud-btn hud-btn-primary px-6 py-2 disabled:opacity-50">
          {pending ? t.admin.settings.savingButton : t.admin.settings.saveButton}
        </button>
      </div>

      <p className="text-xs text-zinc-500 text-center">{t.admin.settings.changesNote}</p>
    </form>
  );
}
