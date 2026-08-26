import { HudLoader } from "@/components/layout/HudLoader";
import { getT } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getT();
  return <HudLoader label={t.core.common.loading} />;
}
