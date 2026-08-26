import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listSeasons } from "@/lib/repositories/seasons.repo";
import { changeStatusAction, createSeasonAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";

const statusFlow: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["paused", "finished"],
  paused: ["active", "finished"],
  finished: ["archived"],
  archived: [],
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");

  const seasons = await listSeasons();

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
          Админка
        </h1>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          Новый сезон
        </h2>
        <FormShell action={createSeasonAction} submitLabel="Создать" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-dim text-sm">
            Название
            <input name="title" required placeholder="Забег #1" />
          </label>
          <label className="text-dim text-sm">
            Slug
            <input name="slug" required pattern="[a-z0-9-]+" placeholder="run-1" />
          </label>
          <label className="text-dim text-sm">
            Клонировать поле из сезона
            <select name="cloneFrom" defaultValue="">
              <option value="">— не клонировать (поле по умолчанию) —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </FormShell>
      </section>

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          Сезоны
        </h2>
        {seasons.length === 0 ? (
          <p className="text-dim">Сезонов пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-dim text-left border-b border-[#3d3d34]">
                <tr>
                  <th className="p-2">Название</th>
                  <th className="p-2">Slug</th>
                  <th className="p-2">Статус</th>
                  <th className="p-2">Действия</th>
                  <th className="p-2">Разделы</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id} className="border-b border-[#2a2a22]">
                    <td className="p-2">{s.title}</td>
                    <td className="p-2 font-mono text-xs">{s.slug}</td>
                    <td className="p-2">
                      <span className="ammo-counter text-amber">{s.status}</span>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        {(statusFlow[s.status] ?? []).map((next) => (
                          <FormShell
                            key={next}
                            action={changeStatusAction}
                            submitLabel={next}
                            className="inline-flex items-center gap-2"
                            submitClassName="hud-btn !py-1 !px-3 text-xs"
                          >
                            <input type="hidden" name="seasonId" value={s.id} />
                            <input type="hidden" name="status" value={next} />
                          </FormShell>
                        ))}
                      </div>
                    </td>
                    <td className="p-2 flex gap-3 text-xs">
                      <Link href={`/admin/seasons/${s.id}`} className="text-amber hover:underline">
                        Настройки
                      </Link>
                      <Link href={`/admin/seasons/${s.id}/board`} className="text-amber hover:underline">
                        Поле
                      </Link>
                      <Link href={`/admin/seasons/${s.id}/players`} className="text-amber hover:underline">
                        Игроки
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hud-card p-4 flex gap-4 text-sm">
        <Link href="/admin/games-catalog" className="text-amber hover:underline">
          Каталог игр →
        </Link>
        <Link href="/admin/audit" className="text-amber hover:underline">
          Аудит-лог →
        </Link>
      </section>
    </div>
  );
}
