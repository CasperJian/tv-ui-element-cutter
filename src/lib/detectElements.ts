import { clampRect, padRect, Rect, rectsIntersect, reindexRects, unionRects } from "./rect";

export type ImageDataLike = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type DetectionOptions = {
  sensitivity: number;
  minAreaRatio: number;
  mergeGap: number;
  padding: number;
  maxElements: number;
};

export const DEFAULT_DETECTION_OPTIONS: DetectionOptions = {
  sensitivity: 70,
  minAreaRatio: 0.0002,
  mergeGap: 12,
  padding: 6,
  maxElements: 120
};

type Component = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
};

export function detectUiElements(
  imageData: ImageDataLike,
  options: Partial<DetectionOptions> = {}
): Rect[] {
  const resolved = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const width = imageData.width;
  const height = imageData.height;
  const minBoxArea = width * height * resolved.minAreaRatio;
  const mask = buildSignalMask(imageData, resolved.sensitivity);
  const closeRadius = Math.max(0, Math.min(10, Math.round(resolved.mergeGap / 4)));
  const closedMask = dilateMask(mask, width, height, closeRadius);
  const components = extractComponents(closedMask, width, height);

  const rects = components
    .map((component) => componentToRect(component))
    .filter((rect) => {
      const boxArea = rect.width * rect.height;
      return boxArea >= minBoxArea && rect.width >= 8 && rect.height >= 8;
    });

  const merged = mergeNearbyRects(rects, resolved.mergeGap)
    .map((rect) => padRect(rect, resolved.padding, width, height))
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, resolved.maxElements);

  return reindexRects(merged);
}

export function detectIconCandidates(
  imageData: ImageDataLike,
  options: Partial<DetectionOptions> = {}
): Rect[] {
  const resolved = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const width = imageData.width;
  const height = imageData.height;
  const imageArea = width * height;
  const minBoxArea = imageArea * resolved.minAreaRatio;
  const maxBoxArea = imageArea * 0.045;
  const mask = buildSignalMask(imageData, resolved.sensitivity);
  const closeRadius = Math.max(1, Math.min(5, Math.round(resolved.mergeGap / 3)));
  const closedMask = dilateMask(mask, width, height, closeRadius);
  const components = extractComponents(closedMask, width, height);

  const rects = components
    .map((component) => componentToRect(component))
    .filter((rect) => isIconLikeRect(rect, minBoxArea, maxBoxArea, width, height));

  const merged = mergeIconRects(rects, resolved.mergeGap, maxBoxArea, width, height)
    .map((rect) => padRect(rect, resolved.padding, width, height))
    .filter((rect) => isIconLikeRect(rect, minBoxArea, maxBoxArea * 1.15, width, height))
    .filter((rect, index, allRects) => !isContainedByBetterRect(rect, index, allRects))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, resolved.maxElements);

  return reindexRects(merged);
}

export function mergeNearbyRects(rects: Rect[], gap: number): Rect[] {
  const working = rects.map((rect) => ({ ...rect }));
  let didMerge = true;

  while (didMerge) {
    didMerge = false;

    outer: for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        if (rectsIntersect(working[i], working[j], gap)) {
          working[i] = unionRects(working[i], working[j]);
          working.splice(j, 1);
          didMerge = true;
          break outer;
        }
      }
    }
  }

  return working
    .map((rect) => ({
      ...rect,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      score: rect.area / Math.max(1, rect.width * rect.height)
    }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

function mergeIconRects(
  rects: Rect[],
  gap: number,
  maxBoxArea: number,
  imageWidth: number,
  imageHeight: number
): Rect[] {
  const working = rects.map((rect) => ({ ...rect }));
  let didMerge = true;

  while (didMerge) {
    didMerge = false;

    outer: for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        if (!rectsIntersect(working[i], working[j], gap)) {
          continue;
        }

        const merged = unionRects(working[i], working[j]);

        if (isIconLikeRect(merged, 0, maxBoxArea, imageWidth, imageHeight, true)) {
          working[i] = merged;
          working.splice(j, 1);
          didMerge = true;
          break outer;
        }
      }
    }
  }

  return working
    .map((rect) => ({
      ...rect,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      score: rect.area / Math.max(1, rect.width * rect.height)
    }))
    .sort((a, b) => b.score - a.score || b.width * b.height - a.width * a.height);
}

function isIconLikeRect(
  rect: Rect,
  minBoxArea: number,
  maxBoxArea: number,
  imageWidth: number,
  imageHeight: number,
  loose = false
): boolean {
  const boxArea = rect.width * rect.height;
  const shortSide = Math.min(rect.width, rect.height);
  const longSide = Math.max(rect.width, rect.height);
  const aspectRatio = longSide / Math.max(1, shortSide);
  const imageShortSide = Math.min(imageWidth, imageHeight);
  const minSide = Math.max(10, imageShortSide * 0.012);
  const maxSide = Math.max(72, imageShortSide * (loose ? 0.36 : 0.32));
  const density = rect.area / Math.max(1, boxArea);

  if (boxArea < minBoxArea || boxArea > maxBoxArea) {
    return false;
  }

  if (shortSide < minSide || longSide > maxSide) {
    return false;
  }

  if (aspectRatio > (loose ? 3.2 : 2.55)) {
    return false;
  }

  if (density < 0.015 && boxArea < imageWidth * imageHeight * 0.01) {
    return false;
  }

  return true;
}

function isContainedByBetterRect(rect: Rect, index: number, allRects: Rect[]): boolean {
  const rectArea = rect.width * rect.height;

  return allRects.some((candidate, candidateIndex) => {
    if (candidateIndex === index) {
      return false;
    }

    const intersection = intersectionArea(rect, candidate);
    const candidateArea = candidate.width * candidate.height;
    const rectIsSmaller = rectArea <= candidateArea;
    return rectIsSmaller && intersection / Math.max(1, rectArea) > 0.88;
  });
}

function intersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function buildSignalMask(imageData: ImageDataLike, sensitivity: number): Uint8Array {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const threshold = Math.max(14, 128 - sensitivity);
  const colorThreshold = Math.max(0.18, 0.38 - sensitivity * 0.002);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const alpha = data[offset + 3];

      if (alpha < 16) {
        continue;
      }

      const luma = getLumaAt(data, index);
      const horizontal =
        Math.abs(luma - getLumaAt(data, index - 1)) +
        Math.abs(luma - getLumaAt(data, index + 1));
      const vertical =
        Math.abs(luma - getLumaAt(data, index - width)) +
        Math.abs(luma - getLumaAt(data, index + width));
      const contrast = horizontal + vertical;
      const saturation = getSaturation(data[offset], data[offset + 1], data[offset + 2]);

      if (
        contrast >= threshold ||
        (saturation >= colorThreshold && contrast >= threshold * 0.42) ||
        (luma >= 208 && contrast >= threshold * 0.18)
      ) {
        mask[index] = 1;
      }
    }
  }

  return mask;
}

function getLumaAt(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function getSaturation(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius === 0) {
    return mask;
  }

  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue;
      }

      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);

      for (let yy = top; yy <= bottom; yy += 1) {
        const row = yy * width;
        for (let xx = left; xx <= right; xx += 1) {
          output[row + xx] = 1;
        }
      }
    }
  }

  return output;
}

function extractComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const components: Component[] = [];
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }

    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    const enqueueNeighbor = (index: number, valid: boolean): void => {
      if (!valid || visited[index] === 1 || mask[index] === 0) {
        return;
      }

      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    };

    while (head < tail) {
      const current = queue[head];
      head += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      enqueueNeighbor(current - 1, x > 0);
      enqueueNeighbor(current + 1, x < width - 1);
      enqueueNeighbor(current - width, y > 0);
      enqueueNeighbor(current + width, y < height - 1);
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels: tail
    });
  }

  return components;
}

function componentToRect(component: Component): Rect {
  const base = clampRect(
    {
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      area: component.pixels,
      score: component.pixels / Math.max(1, component.width * component.height)
    },
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  );

  return base;
}
