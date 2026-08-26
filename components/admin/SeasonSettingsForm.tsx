"use client";

import { useActionState, useState } from "react";
import { updateSeasonSettingsAction } from "@/lib/use-cases/admin-actions";
import { Switch } from "@/components/ui/Switch";
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
        active
          ? "bg-amber text-black border-amber shadow"
          : "bg-[#1a1a1a] text-zinc-300 border-zinc-700 hover:border-amber/50"
      }`}
    >
      {children}
    </button>
  );
}

export default function SeasonSettingsForm({ seasonId, initialConfig, initialRulesMd }: Props) {
  const [activeTab, setActiveTab] = useState<"templates" | "dice" | "board" | "pool">("templates");
  const [cfg, setCfg] = useState<SeasonConfig>(initialConfig);
  const [rulesMd, setRulesMd] = useState(initialRulesMd ?? "");

  // retain initial for reset
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

  // Build hidden form submission as FormData via action with structured flag
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
    // filters
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
    // ordering duplicated for legacy mapping
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
      {/* Tabs */}
      <div className="hud-card overflow-hidden p-0">
        <div className="flex flex-wrap border-b border-zinc-800 bg-[#0f0f0f]">
          <TabButton id="templates" label="Templates" />
          <TabButton id="dice" label="Dice & Points" />
          <TabButton id="board" label="Board" />
          <TabButton id="pool" label="Game Pool" />
        </div>

        <div className="p-5">
          {activeTab === "templates" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase tracking-wider">Choose a preset or go custom</h3>
                {cfg.gamePool.templateId && (
                  <button type="button" onClick={clearTemplate} className="text-xs text-amber underline">
                    Clear template → custom
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-400">
                Templates pre-fill genres, tags and board hints. You can keep customizing afterwards — changing any filter will keep the template tag, clear it to return to fully manual.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={`text-left p-4 rounded-lg border-2 transition group ${
                      cfg.gamePool.templateId === tpl.id
                        ? "border-amber bg-amber/10 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                        : "border-zinc-800 bg-[#151515] hover:border-amber/40 hover:bg-[#1c1c1c]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{tpl.icon}</span>
                      <span className="font-display uppercase tracking-wider text-sm">{tpl.label}</span>
                      {cfg.gamePool.templateId === tpl.id && <span className="ml-auto text-xs bg-amber text-black px-1.5 py-0.5 rounded">active</span>}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{tpl.description}</p>
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {(tpl.filters.genres ?? []).slice(0, 3).map((g) => (
                        <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {g}
                        </span>
                      ))}
                      {(tpl.filters.tags ?? []).slice(0, 3).map((tg) => (
                        <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-amber/20 text-amber">
                          {tg}
                        </span>
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
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">Dice</h4>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">Sides per die (2–20)</span>
                    <input
                      type="range"
                      min={2}
                      max={20}
                      value={cfg.dice.sides}
                      onChange={(e) => setDice({ sides: Number(e.target.value) })}
                    />
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>2</span>
                      <span className="text-amber font-bold text-sm">d{cfg.dice.sides}</span>
                      <span>20</span>
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-400">Dice on pass</span>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={cfg.dice.passDiceCount}
                        onChange={(e) => setDice({ passDiceCount: Number(e.target.value) })}
                        className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-400">Dice on drop</span>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={cfg.dice.dropDiceCount}
                        onChange={(e) => setDice({ dropDiceCount: Number(e.target.value) })}
                        className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                      />
                    </label>
                  </div>
                  <Switch
                    checked={cfg.dice.dropStreakMultiplier}
                    onChange={(v) => setDice({ dropStreakMultiplier: v })}
                    label="Streak multiplier on drop (× streak+1)"
                    description="When enabled, consecutive drops multiply step size"
                  />
                  <div className="hud-card p-3 bg-black/30 text-xs text-zinc-400">
                    Pass = forward by dice sum{cfg.points.bonusAddsToRollOnPass && cfg.points.bonusAddsToRollOnPass ? " + balance" : ""}. Drop = backward{cfg.dice.dropStreakMultiplier ? " × streak" : ""}.
                  </div>
                </div>
              </section>

              <section className="hud-card p-4 bg-[#0f0f0f] border-zinc-800">
                <h4 className="font-display uppercase tracking-wider text-amber mb-3">Points & Rerolls</h4>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">Starting balance</span>
                    <input
                      type="number"
                      min={0}
                      value={cfg.points.startingBalance}
                      onChange={(e) => setPoints({ startingBalance: Number(e.target.value) })}
                      className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                    />
                  </label>
                  <Switch
                    checked={cfg.points.bonusAddsToRollOnPass}
                    onChange={(v) => setPoints({ bonusAddsToRollOnPass: v })}
                    label="Bonus adds to roll on pass"
                    description="Balance augments forward movement"
                  />
                  <Switch
                    checked={cfg.points.resetBalanceAfterUse}
                    onChange={(v) => setPoints({ resetBalanceAfterUse: v })}
                    label="Reset balance after use"
                    description="Consume balance after augmented roll"
                  />
                  <div className="h-px bg-zinc-800 my-1" />
                  <Switch
                    checked={cfg.rerolls.allowed}
                    onChange={(v) => setRerolls({ allowed: v })}
                    label="Allow rerolls"
                    description="Players can request a different game"
                  />
                  <label className="flex flex-col gap-1 text-sm opacity-90">
                    <span className="text-zinc-400">Max rerolls per game</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={cfg.rerolls.limitPerGame}
                      onChange={(e) => setRerolls({ limitPerGame: Number(e.target.value) })}
                      className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                      disabled={!cfg.rerolls.allowed}
                    />
                  </label>
                </div>
              </section>
            </div>
          )}

          {activeTab === "board" && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Board size (cells)</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={cfg.board.size}
                    onChange={(e) => setBoard({ size: Number(e.target.value) })}
                  />
                  <span className="text-amber font-mono text-center text-lg">{cfg.board.size}</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Distribution</span>
                  <select
                    value={cfg.board.distribution}
                    onChange={(e) => setBoard({ distribution: e.target.value as SeasonConfig["board"]["distribution"] })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2"
                  >
                    {BOARD_DISTRIBUTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-6">
                  <Switch
                    checked={cfg.board.loop}
                    onChange={(v) => setBoard({ loop: v })}
                    label="Loop board (wrap around)"
                    description="Finish wraps to start, no hard edge"
                  />
                </div>
              </div>


              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: "bonusCount", label: "Bonus cells", color: "text-emerald-400", bg: "bg-emerald-500" },
                  { key: "penaltyCount", label: "Penalty cells", color: "text-red-400", bg: "bg-red-500" },
                  { key: "teleportCount", label: "Teleports", color: "text-violet-400", bg: "bg-violet-500" },
                  { key: "eventCount", label: "Event cells", color: "text-sky-400", bg: "bg-sky-500" },
                ].map((f) => (
                  <label key={f.key} className="hud-card p-3 bg-[#0f0f0f] border-zinc-800 flex flex-col gap-2">
                    <span className={`text-xs uppercase tracking-wider ${f.color}`}>{f.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={cfg.board.size}
                      value={cfg.board[f.key as keyof SeasonConfig["board"]] as number}
                      onChange={(e) => setBoard({ [f.key]: Number(e.target.value) } as never)}
                      className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5 text-center font-mono"
                    />
                    <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full ${f.bg}`}
                        style={{
                          width: `${Math.min(100, ((cfg.board[f.key as keyof SeasonConfig["board"]] as number) / cfg.board.size) * 100)}%`,
                        }}
                      />
                    </div>
                  </label>
                ))}
              </div>

              {!boardValid && (
                <div className="hud-card p-3 bg-red-950/30 border-red-800 text-sm text-red-300">
                  Special cells ({boardTotalSpecials}) exceed board capacity ({cfg.board.size - (cfg.board.loop ? 1 : 2)} inner cells). Reduce counts.
                </div>
              )}

              <div className="hud-card p-3 bg-black/20 text-xs">
                <div className="flex gap-1.5 mb-1">
                  <span className="px-2 py-0.5 rounded bg-zinc-800">Start</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300">Bonus ×{cfg.board.bonusCount}</span>
                  <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-300">Penalty ×{cfg.board.penaltyCount}</span>
                  <span className="px-2 py-0.5 rounded bg-violet-900/60 text-violet-300">TP ×{cfg.board.teleportCount}</span>
                  <span className="px-2 py-0.5 rounded bg-sky-900/60 text-sky-300">Event ×{cfg.board.eventCount}</span>
                  <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">Normal ×{boardNormal}</span>
                  {!cfg.board.loop && <span className="px-2 py-0.5 rounded bg-amber/20 text-amber">Finish</span>}
                </div>
                <div className="h-2 rounded overflow-hidden flex">
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
                    label="Regenerate board on save"
                    description="Overwrite all cells with new distribution"
                    variant="danger"
                  />
                </div>
                {cfg.board.regenerateOnSave && (
                  <p className="text-xs text-danger/90 mt-2 border border-danger/30 bg-danger/10 p-2 rounded">⚠️ This will delete current cell layout and re-roll positions/effects.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "pool" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Source</span>
                  <select
                    value={cfg.gamePool.source}
                    onChange={(e) => setGamePool({ source: e.target.value as SeasonConfig["gamePool"]["source"] })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2"
                  >
                    {GAME_POOL_SOURCES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Provider</span>
                  <select
                    value={cfg.gamePool.provider}
                    onChange={(e) => setGamePool({ provider: e.target.value as SeasonConfig["gamePool"]["provider"] })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2"
                    disabled={cfg.gamePool.source === "catalog"}
                  >
                    {GAME_PROVIDERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Ordering</span>
                  <select
                    value={cfg.gamePool.filters.ordering}
                    onChange={(e) => setFilters({ ordering: e.target.value })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2"
                  >
                    {ORDERINGS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Genres</span>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <Chip
                      key={g.value}
                      active={cfg.gamePool.filters.genres.includes(g.value)}
                      onClick={() =>
                        setFilters({
                          genres: cfg.gamePool.filters.genres.includes(g.value)
                            ? cfg.gamePool.filters.genres.filter((x) => x !== g.value)
                            : [...cfg.gamePool.filters.genres, g.value],
                        })
                      }
                    >
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Platforms</span>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => (
                    <Chip
                      key={p.value}
                      active={cfg.gamePool.filters.platforms.includes(p.value)}
                      onClick={() =>
                        setFilters({
                          platforms: cfg.gamePool.filters.platforms.includes(p.value)
                            ? cfg.gamePool.filters.platforms.filter((x) => x !== p.value)
                            : [...cfg.gamePool.filters.platforms, p.value],
                        })
                      }
                    >
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tg) => (
                    <Chip
                      key={tg.value}
                      active={cfg.gamePool.filters.tags.includes(tg.value)}
                      onClick={() =>
                        setFilters({
                          tags: cfg.gamePool.filters.tags.includes(tg.value)
                            ? cfg.gamePool.filters.tags.filter((x) => x !== tg.value)
                            : [...cfg.gamePool.filters.tags, tg.value],
                        })
                      }
                    >
                      {tg.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Metacritic min</span>
                  <input
                    type="number"
                    placeholder="—"
                    min={0}
                    max={100}
                    value={cfg.gamePool.filters.metacriticMin ?? ""}
                    onChange={(e) => setFilters({ metacriticMin: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Metacritic max</span>
                  <input
                    type="number"
                    placeholder="—"
                    min={0}
                    max={100}
                    value={cfg.gamePool.filters.metacriticMax ?? ""}
                    onChange={(e) => setFilters({ metacriticMax: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Rating min (0–5)</span>
                  <input
                    type="number"
                    step={0.1}
                    placeholder="—"
                    min={0}
                    max={5}
                    value={cfg.gamePool.filters.ratingMin ?? ""}
                    onChange={(e) => setFilters({ ratingMin: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Rating max (0–5)</span>
                  <input
                    type="number"
                    step={0.1}
                    placeholder="—"
                    min={0}
                    max={5}
                    value={cfg.gamePool.filters.ratingMax ?? ""}
                    onChange={(e) => setFilters({ ratingMax: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Year min</span>
                  <input
                    type="number"
                    placeholder="—"
                    value={cfg.gamePool.filters.yearMin ?? ""}
                    onChange={(e) => setFilters({ yearMin: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Year max</span>
                  <input
                    type="number"
                    placeholder="—"
                    value={cfg.gamePool.filters.yearMax ?? ""}
                    onChange={(e) => setFilters({ yearMax: e.target.value === "" ? null : Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Players</span>
                  <select
                    value={cfg.gamePool.filters.players}
                    onChange={(e) => setFilters({ players: e.target.value as SeasonConfig["gamePool"]["filters"]["players"] })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-2"
                  >
                    <option value="any">Any</option>
                    <option value="single">Singleplayer</option>
                    <option value="multi">Multiplayer</option>
                    <option value="coop">Co-op</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Search query</span>
                  <input
                    type="text"
                    placeholder="e.g. elden ring"
                    value={cfg.gamePool.filters.searchQuery ?? ""}
                    onChange={(e) => setFilters({ searchQuery: e.target.value || null })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">ESRB</span>
                <div className="flex flex-wrap gap-1.5">
                  {ESRB.map((e) => (
                    <Chip
                      key={e.value}
                      active={cfg.gamePool.filters.esrb.includes(e.value)}
                      onClick={() =>
                        setFilters({
                          esrb: cfg.gamePool.filters.esrb.includes(e.value)
                            ? cfg.gamePool.filters.esrb.filter((x) => x !== e.value)
                            : [...cfg.gamePool.filters.esrb, e.value],
                        })
                      }
                    >
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 hud-card p-3 bg-black/20">
                <Switch
                  checked={cfg.gamePool.filters.onlyWithCover}
                  onChange={(v) => setFilters({ onlyWithCover: v })}
                  label="Only games with cover"
                  description="Exclude entries without artwork"
                />
                <Switch
                  checked={cfg.gamePool.autoFetchOnRoll}
                  onChange={(v) => setGamePool({ autoFetchOnRoll: v })}
                  label="Auto-fetch fresh game on each roll (API)"
                  description="Bypass cache and hit provider every roll"
                />
                <Switch
                  checked={cfg.gamePool.catalog.allowManualAdd}
                  onChange={(v) => setCatalog({ allowManualAdd: v })}
                  label="Allow manual catalog adds"
                  description="Admins can add games by hand"
                />
                <Switch
                  checked={cfg.gamePool.catalog.fallbackToCatalog}
                  onChange={(v) => setCatalog({ fallbackToCatalog: v })}
                  label="Fallback to catalog if API empty"
                  description="Use local pool when provider returns none"
                />
              </div>


              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Max candidates per roll</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={cfg.gamePool.maxCandidates}
                    onChange={(e) => setGamePool({ maxCandidates: Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-400">Cache TTL hours</span>
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={cfg.gamePool.cacheTtlHours}
                    onChange={(e) => setGamePool({ cacheTtlHours: Number(e.target.value) })}
                    className="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1.5"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rules textarea */}
      <section className="hud-card p-4">
        <h3 className="font-display uppercase tracking-wider text-amber mb-2">Season rules (Markdown)</h3>
        <textarea
          value={rulesMd}
          onChange={(e) => setRulesMd(e.target.value)}
          rows={6}
          placeholder="# Rules&#10;Text for the /rules page..."
          className="w-full bg-[#1a1a1a] border border-zinc-700 rounded px-3 py-2 text-sm font-mono"
        />
      </section>

      {state?.error && <div className="hud-card p-3 bg-red-950/40 border-red-800 text-sm text-red-300">{state.error}</div>}
      {state?.ok && <div className="hud-card p-3 bg-emerald-950/30 border-emerald-800 text-sm text-emerald-300">{state.ok}</div>}

      <div className="flex gap-3 justify-end">
        <button type="submit" disabled={pending || !boardValid} className="hud-btn hud-btn-primary px-6 py-2 disabled:opacity-50">
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>

      <p className="text-xs text-zinc-500 text-center">
        All changes take effect immediately — including for active seasons. No JSON editing required.
      </p>
    </form>
  );
}
