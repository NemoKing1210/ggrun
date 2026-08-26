"use client";

import { useEffect, useRef, useState } from "react";

import type { BoardCell } from "@/db/schema";

import { CELL_THEME } from "./cell-theme";

export type BoardMarker = {
  username: string;
  displayName: string | null;
  position: number;
};


/**
 * Поле «горизонтальной змейкой»: чётные ряды слева направо,
 * нечётные — справа налево. Кол-во колонок считается по ширине
 * контейнера (ResizeObserver), canvas не нужен.
 */
export function SnakeBoard({
  cells,
  markers,
}: {
  cells: BoardCell[];
  markers: BoardMarker[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(6);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setCols(Math.min(12, Math.max(3, Math.floor(w / 104))));
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows: BoardCell[][] = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols));
  }

  const byPosition = new Map<number, BoardMarker[]>();
  for (const m of markers) {
    const list = byPosition.get(m.position) ?? [];
    list.push(m);
    byPosition.set(m.position, list);
  }

  return (
    <div ref={ref} className="w-full">
      <div className="flex flex-col gap-2 sm:gap-3">
        {rows.map((row, ri) => (
          <ol
            key={ri}
            className={`flex gap-2 sm:gap-3 ${ri % 2 === 1 ? "flex-row-reverse" : ""}`}
          >
            {row.map((cell) => {
              const theme = CELL_THEME[cell.cellType];
              const here = byPosition.get(cell.position) ?? [];
              return (
                <li
                  key={cell.id}
                  className="min-w-0 flex-1"
                  title={
                    cell.label ? `${theme.name}: ${cell.label}` : theme.name
                  }
                >
                  <ul className="mb-1 flex h-5 flex-row-reverse justify-end gap-0.5">
                    {here.slice(0, 4).map((m) => (
                      <li key={m.username}>
                        <span className="inline-flex h-5 items-center border border-amber/70 bg-raised px-1 font-mono text-[10px] leading-none text-amber">
                          {(m.displayName ?? m.username).slice(0, 2).toUpperCase()}
                        </span>
                      </li>
                    ))}
                    {here.length > 4 ? (
                      <li>
                        <span className="inline-flex h-5 items-center border border-dim/60 px-1 font-mono text-[10px] leading-none text-dim">
                          +{here.length - 4}
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  <div
                    className={`flex aspect-square flex-col items-start justify-between border p-1.5 sm:p-2 ${theme.box}`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest opacity-80">
                      {theme.name}
                    </span>
                    <span className="ammo-counter self-end text-lg leading-none sm:text-xl">
                      {cell.position}
                    </span>
                  </div>
                  {cell.label ? (
                    <p className="mt-1 truncate font-mono text-[10px] text-dim">
                      {cell.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </div>
  );
}
