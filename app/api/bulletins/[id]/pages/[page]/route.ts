import { todayInSeoul } from "../../../../../../src/features/challenge/date";
import { failure, imageResponse } from "../../../../../../src/features/bulletin/http";
import { assertBulletinId, parsePageNumber } from "../../../../../../src/features/bulletin/policy";
import { getPublicPageImage } from "../../../../../../src/features/bulletin/service";
import { DomainError } from "../../../../../../src/lib/http";

/** Public page image (`?size=thumb` for the small version). Hidden or expired bulletins look like they do not exist. */
export async function GET(request: Request, context: { params: Promise<{ id: string; page: string }> }) {
  try {
    const { id, page } = await context.params;
    assertBulletinId(id);
    const number = parsePageNumber(page);
    const kind = new URL(request.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
    const image = await getPublicPageImage(id, number, kind, todayInSeoul());
    if (!image) throw new DomainError("PAGE_NOT_FOUND", 404);
    return imageResponse(request, image, `${number}-${kind}`, "public, max-age=3600, s-maxage=3600");
  } catch (error) {
    return failure(error);
  }
}
