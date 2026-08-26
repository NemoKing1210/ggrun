import { HudLoader } from "@/components/layout/HudLoader";
import { getT } from "@/lib/i18n/server";

/** Консольный вариант загрузки для админ-оболочки. */
export default async function AdminLoading() {
  const { t } = await getT();
  return (
    <div className="font-mono">
      <HudLoader label={t.core.common.loading} />
    </div>
  );
}
