import { describe, expect, it } from "vitest";
import {
  extractVisualFeatures,
  labelFromFileName,
  recognizeIcon,
  type ReferenceIcon
} from "../src/lib/recognizeIcons";
import type { ImageDataLike } from "../src/lib/detectElements";

describe("recognizeIcon", () => {
  it("recognizes a matching reference icon", () => {
    const referenceImage = createImage(32, 32, [12, 12, 12, 255]);
    fillRect(referenceImage, 12, 4, 8, 24, [230, 0, 20, 255]);
    const candidateImage = createImage(32, 32, [10, 10, 10, 255]);
    fillRect(candidateImage, 12, 4, 8, 24, [226, 0, 18, 255]);
    const reference: ReferenceIcon = {
      id: "netflix",
      label: "Netflix",
      fileName: "netflix.png",
      width: 32,
      height: 32,
      previewSrc: "",
      features: extractVisualFeatures(referenceImage)
    };

    const result = recognizeIcon(extractVisualFeatures(candidateImage), [reference]);

    expect(result.label).toBe("Netflix");
    expect(result.source).toBe("reference");
    expect(result.confidence).toBeGreaterThan(0.62);
  });

  it("uses heuristics for a red-on-dark Netflix-like icon", () => {
    const image = createImage(40, 40, [8, 8, 8, 255]);
    fillRect(image, 15, 4, 10, 32, [232, 0, 18, 255]);

    const result = recognizeIcon(extractVisualFeatures(image), []);

    expect(result.label).toBe("Netflix");
    expect(result.source).toBe("heuristic");
  });

  it("turns file names into readable labels", () => {
    expect(labelFromFileName("settings_icon.png")).toBe("Settings Icon");
    expect(labelFromFileName("netflix-tv.webp")).toBe("Netflix Tv");
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
