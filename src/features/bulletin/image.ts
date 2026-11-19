import sharp from "sharp";
import { DomainError } from "../../lib/http";

export type PageImage = { image: Buffer; width: number; height: number; thumb: Buffer };

const MAX_STORED_BYTES = 1_500_000;
const PAGE_BOUNDS = { width: 1600, height: 2800 };
const THUMB_WIDTH = 360;

/**
 * Re-encodes an uploaded page image: only the decoded pixels are kept (no metadata or appended data),
 * the size is capped, and a small thumbnail is made for lists.
 */
export async function normalizePageImage(bytes: Buffer): Promise<PageImage> {
  if (bytes.length === 0) throw new DomainError("INVALID_IMAGE", 400);
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await source.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
      throw new DomainError("INVALID_IMAGE", 400);
    }
    const { data, info } = await source
      .rotate()
      .resize({ ...PAGE_BOUNDS, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_STORED_BYTES) throw new DomainError("IMAGE_TOO_LARGE", 413);
    const thumb = await sharp(data).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    return { image: data, width: info.width, height: info.height, thumb };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_IMAGE", 400);
  }
}
