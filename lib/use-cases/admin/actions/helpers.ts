import { revalidatePath } from "next/cache";

import { AdminError } from "@/lib/modules/season/service/errors";
import { makeToError } from "@/lib/use-cases/shared/action-error";

export const toError = makeToError(AdminError);

export function revalidateAdmin(seasonId?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/seasons");
  if (seasonId) {
    revalidatePath(`/admin/seasons/${seasonId}`);
    revalidatePath(`/admin/seasons/${seasonId}/board`);
    revalidatePath(`/admin/seasons/${seasonId}/players`);
  }
}
