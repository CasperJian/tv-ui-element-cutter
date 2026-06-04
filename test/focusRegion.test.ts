import { describe, expect, it } from "vitest";
import {
  fullImageRegion,
  focusRegionFromRatio,
  focusRegionToRatio,
  isUsableFocusRegion,
  mapRectFromFocusRegion,
  normalizeFocusRegion
} from "../src/lib/focusRegion";
import type { Rect } from "../src/lib/rect";

describe("focusRegion", () => {
  it("normalizes drag direction and clamps to image bounds", () => {
    const region = normalizeFocusRegion({ x: 220, y: 160 }, { x: -20, y: 40 }, 200, 120);

    expect(region).toEqual({
      x: 0,
      y: 40,
      width: 200,
      height: 80
    });
  });

  it("rejects tiny focus regions", () => {
    expect(isUsableFocusRegion({ x: 10, y: 10, width: 18, height: 30 })).toBe(false);
    expect(isUsableFocusRegion({ x: 10, y: 10, width: 80, height: 60 })).toBe(true);
  });

  it("maps icon rectangles from focused ROI coordinates back to the original image", () => {
    const rect: Rect = {
      id: "element-001",
      x: 20,
      y: 12,
      width: 40,
      height: 30,
      area: 1200,
      score: 1
    };

    const mapped = mapRectFromFocusRegion(rect, { x: 100, y: 80, width: 500, height: 300 }, 0.5);

    expect(mapped.x).toBe(140);
    expect(mapped.y).toBe(104);
    expect(mapped.width).toBe(80);
    expect(mapped.height).toBe(60);
    expect(mapped.area).toBe(4800);
  });

  it("creates a full-image region", () => {
    expect(fullImageRegion(1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    });
  });

  it("reuses a focus region ratio across image sizes", () => {
    const ratio = focusRegionToRatio({ x: 96, y: 54, width: 768, height: 432 }, 960, 540);
    const scaled = focusRegionFromRatio(ratio, 1920, 1080);

    expect(scaled).toEqual({
      x: 192,
      y: 108,
      width: 1536,
      height: 864
    });
  });
});
