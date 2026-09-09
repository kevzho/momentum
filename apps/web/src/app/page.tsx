import { redirect } from "next/navigation";

/** The product opens on Today; there is no separate home surface. */
export default function RootPage() {
  redirect("/today");
}
