import { describe, expect, it } from "vitest";
import {
  detectIconCandidates,
  detectUiElements,
  mergeNearbyRects,
  type ImageDataLike
} from "../src/lib/detectElements";
import { padRect, type Rect } from "../src/lib/rect";

describe("detectUiElements", () => {
  it("detects a high-contrast UI panel", () => {
    const image = createImage(220, 140, [18, 22, 22, 255]);
    fillRect(image, 42, 30, 84, 48, [242, 244, 239, 255]);

    const rects = detectUiElements(image, {
      sensitivity: 72,
      minAreaRatio: 0.0004,
      mergeGap: 18,
      padding: 0,
      maxElements: 10
    });

    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeLessThanOrEqual(42);
    expect(rects[0].y).toBeLessThanOrEqual(30);
    expect(rects[0].width).toBeGreaterThanOrEqual(84);
    expect(rects[0].height).toBeGreaterThanOrEqual(48);
  });

  it("ignores tiny artifacts below the minimum area", () => {
    const image = createImage(220, 140, [18, 22, 22, 255]);
    fillRect(image, 8, 8, 3, 3, [255, 255, 255, 255]);

    const rects = detectUiElements(image, {
      sensitivity: 80,
      minAreaRatio: 0.01,
      mergeGap: 4,
      padding: 0,
      maxElements: 10
    });

    expect(rects).toHaveLength(0);
  });
});

describe("detectIconCandidates", () => {
  it("cuts compact icons from the full UI", () => {
    const image = createImage(320, 180, [20, 24, 24, 255]);
    fillRect(image, 40, 40, 36, 36, [230, 0, 18, 255]);
    fillRect(image, 118, 42, 42, 32, [235, 238, 238, 255]);

    const rects = detectIconCandidates(image, {
      sensitivity: 72,
      minAreaRatio: 0.0002,
      mergeGap: 10,
      padding: 4,
      maxElements: 20
    });

    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(rects.some((rect) => rect.x <= 40 && rect.y <= 40)).toBe(true);
  });

  it("filters long text-like regions", () => {
    const image = createImage(320, 180, [20, 24, 24, 255]);
    fillRect(image, 40, 44, 170, 18, [235, 238, 238, 255]);

    const rects = detectIconCandidates(image, {
      sensitivity: 72,
      minAreaRatio: 0.0001,
      mergeGap: 8,
      padding: 2,
      maxElements: 20
    });

    expect(rects).toHaveLength(0);
  });
});

describe("rect helpers", () => {
  it("merges nearby rectangles into one export area", () => {
    const rects: Rect[] = [
      { id: "a", x: 10, y: 10, width: 30, height: 20, area: 600, score: 1 },
      { id: "b", x: 48, y: 12, width: 20, height: 18, area: 360, score: 1 }
    ];

    const merged = mergeNearbyRects(rects, 10);

    expect(merged).toHaveLength(1);
    expect(merged[0].x).toBe(10);
    expect(merged[0].width).toBe(58);
  });

  it("clamps padded rectangles to image bounds", () => {
    const padded = padRect(
      { id: "a", x: 4, y: 5, width: 20, height: 24, area: 480, score: 1 },
      12,
      100,
      80
    );

    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
    expect(padded.width).toBe(36);
    expect(padded.height).toBe(41);
  });
});

function createImage(
  width: number,
  height: number,
  color: [number, number, number, number]
): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }

  return { width, height, data };
}

function fillRect(
  image: ImageDataLike,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number]
): void {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = color[3];
    }
  }
}
