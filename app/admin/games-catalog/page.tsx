import { redirect } from "next/navigation";

export default function GamesCatalogRedirect() {
  redirect("/admin/games");
}
