import type { Metadata } from "next";
import { BulletinHome } from "../../components/bulletin/BulletinHome";
import { listPublicBulletins } from "../../src/features/bulletin/service";
import { todayInSeoul } from "../../src/features/challenge/date";

export const metadata: Metadata = {
  title: "주보",
  description: "삼덕청년부 주일 주보를 앱에서 바로 볼 수 있습니다.",
};

// Always read the current list: a new bulletin must appear without a redeploy.
export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  const bulletins = await listPublicBulletins(todayInSeoul());
  return <BulletinHome bulletins={bulletins} />;
}
