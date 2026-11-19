import PublicLayout from "../(public)/layout";
import { MemberShell } from "../../components/app/MemberShell";
import { getCurrentSessionUser } from "../../src/features/auth/http-session";
import { getPrayerMenuSettings } from "../../src/features/prayer-menu/service";

/**
 * The offering information is public. Signed-in members see it inside the app menu; everyone else gets
 * the public page frame (no redirect to login).
 */
export default async function OfferingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentSessionUser();
  if (user) {
    const setting = await getPrayerMenuSettings();
    return <MemberShell user={user} initialPrayerMenuSettings={setting}>{children}</MemberShell>;
  }
  return <PublicLayout>{children}</PublicLayout>;
}
