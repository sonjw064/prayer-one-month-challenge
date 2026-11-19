import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizePageImage } from "../../src/features/bulletin/image";
import { DomainError } from "../../src/lib/http";

async function solid(width: number, height: number, format: "jpeg" | "png" | "webp" | "gif" = "jpeg") {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })[format]().toBuffer();
}

const rejects = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code } satisfies Partial<DomainError>);

describe("bulletin page image normalization", () => {
  it("re-encodes to WebP within the page bounds and makes a thumbnail", async () => {
    const result = await normalizePageImage(await solid(2000, 3000));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(2400);
    const image = await sharp(result.image).metadata();
    expect(image.format).toBe("webp");
    const thumb = await sharp(result.thumb).metadata();
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(360);
    expect(result.thumb.length).toBeLessThan(result.image.length);
  });

  it("never enlarges a small image", async () => {
    const result = await normalizePageImage(await solid(800, 1100));
    expect([result.width, result.height]).toEqual([800, 1100]);
  });

  it("caps the height of very tall pages", async () => {
    const result = await normalizePageImage(await solid(1400, 4000));
    expect(result.height).toBeLessThanOrEqual(2800);
  });

  it("accepts JPEG, PNG and WebP uploads", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const result = await normalizePageImage(await solid(500, 700, format));
      expect(result.width, format).toBe(500);
    }
  });

  it("rejects other formats, empty bodies and non-images", async () => {
    await rejects(normalizePageImage(await solid(100, 100, "gif")), "INVALID_IMAGE");
    await rejects(normalizePageImage(Buffer.alloc(0)), "INVALID_IMAGE");
    await rejects(normalizePageImage(Buffer.from("<script>alert(1)</script>")), "INVALID_IMAGE");
    await rejects(normalizePageImage(Buffer.from("%PDF-1.4 not an image")), "INVALID_IMAGE");
  });

  it("rejects images with an absurd number of pixels", async () => {
    await rejects(normalizePageImage(await solid(7000, 7000, "png")), "INVALID_IMAGE");
  });

  it("drops anything appended after the image data", async () => {
    const jpeg = await solid(600, 800);
    const sneaky = Buffer.concat([jpeg, Buffer.from("<?php echo 1; ?>")]);
    const result = await normalizePageImage(sneaky);
    expect(result.image.includes(Buffer.from("<?php"))).toBe(false);
  });
});
