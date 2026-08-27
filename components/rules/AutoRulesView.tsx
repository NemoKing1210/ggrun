import type { SeasonConfig } from "@/game-engine/types";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Season } from "@/db/schema";
import { Badge } from "@/components/ui/Badge";
import { format } from "@/lib/i18n/format";

type Props = {
  season: Season;
  config: SeasonConfig;
  t: Dictionary;
  boardCellsCount?: number;
};

export function AutoRulesView({ season, config, t, boardCellsCount }: Props) {
  const rt = t.rules;
  const boardSize = config.board.size;
  const special = config.board.bonusCount + config.board.penaltyCount + config.board.teleportCount + config.board.eventCount;
  const normal = Math.max(0, boardSize - special - (config.board.loop ? 1 : 2));
  const loopHint = config.board.loop ? rt.loopHintActive : rt.loopHintLinear;
  const diceStreak = config.dice.dropStreakMultiplier ? rt.streakOn : rt.streakOff;

  const filterChips: string[] = [];
  if (config.gamePool.filters.genres.length) filterChips.push(...config.gamePool.filters.genres);
  if (config.gamePool.filters.tags.length) filterChips.push(...config.gamePool.filters.tags);
  if (config.gamePool.filters.platforms.length) filterChips.push(...config.gamePool.filters.platforms);
  if (config.gamePool.filters.esrb.length) filterChips.push(...config.gamePool.filters.esrb);
  if (config.gamePool.filters.searchQuery) filterChips.push(`“${config.gamePool.filters.searchQuery}”`);

  return (
    <div className="space-y-6">
      <div className="hud-card overflow-hidden">
        <div className="relative bg-gradient-to-br from-amber/[0.08] via-transparent to-military/[0.06] p-6 sm:p-7">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/40 to-transparent" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">{"// "}{rt.kicker} • {season.title}</p>
              <h2 className="font-display mt-1 text-2xl uppercase tracking-wide text-amber sm:text-3xl">{rt.sections.overview}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-300">{format(rt.overviewText, { season: season.title, boardSize: String(boardSize), status: t.core.seasonStatuses[season.status], loopHint })}</p>
              <p className="mt-2 font-mono text-xs text-dim">{rt.autoHint}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant="amber">{rt.autoBadge}</Badge>
              <span className="border border-dim/20 bg-raised px-2 py-1 font-mono text-xs text-dim">
                {t.core.seasonStatuses[season.status]} • {boardSize} cells
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="neutral">{season.slug}</Badge>
            <Badge variant={config.board.loop ? "military" : "dim"}>{config.board.loop ? "LOOP" : "LINEAR"}</Badge>
            <Badge variant="neutral">{config.board.distribution}</Badge>
            {boardCellsCount !== undefined ? <Badge variant="dim">actual cells {boardCellsCount}</Badge> : null}
          </div>
        </div>
        <div className="hazard-tape" aria-hidden />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="hud-card p-5">
          <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.dice}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="amber" size="md">d{config.dice.sides}</Badge>
            <Badge variant="neutral">pass {config.dice.passDiceCount}×</Badge>
            <Badge variant="neutral">drop {config.dice.dropDiceCount}×</Badge>
            {config.dice.dropStreakMultiplier ? <Badge variant="military">streak ×</Badge> : <Badge variant="dim">no streak</Badge>}
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-300">
            {format(rt.diceDetails, { sides: String(config.dice.sides), pass: String(config.dice.passDiceCount), drop: String(config.dice.dropDiceCount), streak: diceStreak })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
            <span className="border border-dim/15 bg-raised px-2 py-1 text-center">pass → + dice sum</span>
            <span className="border border-dim/15 bg-raised px-2 py-1 text-center">drop → − dice sum</span>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {config.dice.dropStreakMultiplier ? "Consecutive drops multiply step: (streakDrop+1) × dice sum." : "Drop step is flat dice sum, streak ignored."}{" "}
            {config.points.bonusAddsToRollOnPass ? "Balance augments forward roll." : ""}
          </p>
        </div>

        <div className="hud-card p-5">
          <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.points}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="neutral">start {config.points.startingBalance}</Badge>
            <Badge variant={config.points.bonusAddsToRollOnPass ? "amber" : "dim"}>{config.points.bonusAddsToRollOnPass ? t.admin.settings.bonusOnPassLabel : "no bonus"}</Badge>
            <Badge variant={config.points.resetBalanceAfterUse ? "danger" : "dim"}>{config.points.resetBalanceAfterUse ? "reset after use" : "retain"}</Badge>
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-300">
            {format(rt.pointsDetails, {
              balance: String(config.points.startingBalance),
              bonus: config.points.bonusAddsToRollOnPass ? rt.bonusOn : rt.bonusOff,
              reset: config.points.resetBalanceAfterUse ? rt.resetOn : rt.resetOff,
            })}
          </p>
          <div className="mt-3 border border-dim/15 bg-raised p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-dim">Rerolls</span>
              <Badge variant={config.rerolls.allowed ? "military" : "dim"}>{config.rerolls.allowed ? "allowed" : "disabled"}</Badge>
            </div>
            <p className="mt-2 font-mono text-xs text-zinc-300">
              {config.rerolls.allowed ? format(rt.rerollsOn, { limit: String(config.rerolls.limitPerGame) }) : rt.rerollsOff}
            </p>
          </div>
        </div>
      </div>

      <div className="hud-card p-5">
        <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.board}</h3>
        <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-300">
          {format(rt.boardDetails, {
            size: String(boardSize),
            distribution: config.board.distribution,
            special: String(special),
            bonus: String(config.board.bonusCount),
            penalty: String(config.board.penaltyCount),
            teleport: String(config.board.teleportCount),
            event: String(config.board.eventCount),
            normal: String(normal),
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="neutral">start 1</Badge>
          <Badge variant="emerald">bonus ×{config.board.bonusCount}</Badge>
          <Badge variant="danger">penalty ×{config.board.penaltyCount}</Badge>
          <Badge variant="violet">TP ×{config.board.teleportCount}</Badge>
          <Badge variant="sky">event ×{config.board.eventCount}</Badge>
          <Badge variant="dim">normal ×{normal}</Badge>
          {!config.board.loop && <Badge variant="amber">finish</Badge>}
        </div>
        <div className="mt-3 h-2 overflow-hidden flex [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] border border-dim/15">
          <div className="bg-zinc-600" style={{ flex: config.board.loop ? 1 : 1 }} />
          {config.board.bonusCount > 0 && <div className="bg-emerald-500" style={{ flex: config.board.bonusCount }} />}
          {config.board.penaltyCount > 0 && <div className="bg-red-500" style={{ flex: config.board.penaltyCount }} />}
          {config.board.teleportCount > 0 && <div className="bg-violet-500" style={{ flex: config.board.teleportCount }} />}
          {config.board.eventCount > 0 && <div className="bg-sky-500" style={{ flex: config.board.eventCount }} />}
          <div className="bg-zinc-800" style={{ flex: normal }} />
          {!config.board.loop && <div className="bg-amber" style={{ flex: 1 }} />}
        </div>
        <p className="mt-2 font-mono text-[11px] text-dim">Distribution: {config.board.distribution} • {config.board.loop ? rt.loopHintActive : rt.loopHintLinear}</p>
      </div>

      <div className="hud-card p-5">
        <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.pool}</h3>
        <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-300">
          {format(rt.poolDetails, {
            source: config.gamePool.source,
            provider: config.gamePool.provider,
            ordering: config.gamePool.filters.ordering,
            candidates: String(config.gamePool.maxCandidates),
            cache: String(config.gamePool.cacheTtlHours),
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="neutral">source {config.gamePool.source}</Badge>
          <Badge variant="neutral">provider {config.gamePool.provider}</Badge>
          <Badge variant="dim">{config.gamePool.filters.ordering}</Badge>
          {config.gamePool.templateId ? <Badge variant="amber">template {config.gamePool.templateId}</Badge> : null}
        </div>
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{rt.filtersLabel}</p>
          {filterChips.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <Badge key={chip} variant="neutral">
                  {chip}
                </Badge>
              ))}
              {config.gamePool.filters.metacriticMin !== null || config.gamePool.filters.metacriticMax !== null ? (
                <Badge variant="dim">
                  meta {config.gamePool.filters.metacriticMin ?? "…"}–{config.gamePool.filters.metacriticMax ?? "…"}
                </Badge>
              ) : null}
              {config.gamePool.filters.ratingMin !== null || config.gamePool.filters.ratingMax !== null ? (
                <Badge variant="dim">
                  rating {config.gamePool.filters.ratingMin ?? "…"}–{config.gamePool.filters.ratingMax ?? "…"}
                </Badge>
              ) : null}
              {config.gamePool.filters.yearMin !== null || config.gamePool.filters.yearMax !== null ? (
                <Badge variant="dim">
                  {config.gamePool.filters.yearMin ?? "…"}–{config.gamePool.filters.yearMax ?? "…"}
                </Badge>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 font-mono text-xs text-dim">{rt.noFilters}</p>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] uppercase tracking-widest text-dim sm:grid-cols-4">
          <span className={`border px-2 py-1 text-center ${config.gamePool.filters.onlyWithCover ? "border-amber/30 bg-amber/10 text-amber" : "border-dim/15 bg-raised"}`}>cover only {config.gamePool.filters.onlyWithCover ? "yes" : "no"}</span>
          <span className={`border px-2 py-1 text-center ${config.gamePool.autoFetchOnRoll ? "border-military/30 bg-military/10 text-military" : "border-dim/15 bg-raised"}`}>auto-fetch {config.gamePool.autoFetchOnRoll ? "on" : "off"}</span>
          <span className="border border-dim/15 bg-raised px-2 py-1 text-center">fallback {config.gamePool.catalog.fallbackToCatalog ? "yes" : "no"}</span>
          <span className="border border-dim/15 bg-raised px-2 py-1 text-center">manual add {config.gamePool.catalog.allowManualAdd ? "yes" : "no"}</span>
        </div>
      </div>

      <div className="hud-card p-5">
        <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.flow}</h3>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {(rt.flowSteps as unknown as string[]).map((step, i) => (
            <li key={i} className="flex gap-3 border border-dim/15 bg-raised p-3">
              <span className="ammo-counter flex size-7 shrink-0 items-center justify-center border border-amber bg-amber text-xs font-bold text-black">{i + 1}</span>
              <span className="text-sm leading-snug text-zinc-200">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="hud-card p-5">
        <h3 className="font-display text-sm uppercase tracking-widest text-amber">{rt.sections.cells}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{rt.cellsText}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="border border-zinc-600 bg-raised p-2 text-center">
            <Badge variant="neutral" size="sm">start</Badge>
            <p className="mt-1 font-mono text-xs text-dim">cell 0</p>
          </div>
          <div className="border border-emerald-700 bg-emerald-950/20 p-2 text-center">
            <Badge variant="emerald" size="sm">bonus</Badge>
            <p className="mt-1 font-mono text-xs text-dim">+ balance</p>
          </div>
          <div className="border border-red-800 bg-red-950/20 p-2 text-center">
            <Badge variant="danger" size="sm">penalty</Badge>
            <p className="mt-1 font-mono text-xs text-dim">− balance</p>
          </div>
          <div className="border border-violet-700 bg-violet-950/20 p-2 text-center">
            <Badge variant="violet" size="sm">teleport</Badge>
            <p className="mt-1 font-mono text-xs text-dim">jump</p>
          </div>
        </div>
      </div>
    </div>
  );
}
