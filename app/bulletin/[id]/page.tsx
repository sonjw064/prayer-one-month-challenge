import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BulletinViewer } from "../../../components/bulletin/BulletinViewer";
import { assertBulletinId } from "../../../src/features/bulletin/policy";
import { getPublicBulletin, listPublicBulletins } from "../../../src/features/bulletin/service";
import { todayInSeoul } from "../../../src/features/challenge/date";

export const metadata: Metadata = { title: "주보" };
export const dynamic = "force-dynamic";

export default async function BulletinViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    assertBulletinId(id);
  } catch {
    notFound();
  }
  const today = todayInSeoul();
  const bulletin = await getPublicBulletin(id, today);
  if (!bulletin) notFound();
  const all = await listPublicBulletins(today);
  return <BulletinViewer bulletin={bulletin} all={all} />;
}
