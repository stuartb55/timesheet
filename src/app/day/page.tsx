import { redirect } from "next/navigation";
import { nowInLondon } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function TodayRedirect() {
  redirect(`/day/${nowInLondon().date}`);
}
