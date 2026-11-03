import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../app/manifest";

function pngSize(path: string) {
  const bytes = readFileSync(join(process.cwd(), path));
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("PWA manifest", () => {
  it("uses the requested app name and standalone mode", () => {
    const value = manifest();
    expect(value.name).toBe("3D");
    expect(value.short_name).toBe("3D");
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/");
  });

  it("ships correctly sized install icons", () => {
    expect(pngSize("public/icons/3duks-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/icons/3duks-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/icons/3duks-maskable-512.png")).toEqual({ width: 512, height: 512 });
  });
});
