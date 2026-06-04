import { ImageDataLike } from "./detectElements";

export type RecognitionSource = "reference" | "heuristic" | "unknown";

export type VisualFeatures = {
  width: number;
  height: number;
  aspectRatio: number;
  edgeDensity: number;
  meanSaturation: number;
  redRatio: number;
  blueRatio: number;
  greenRatio: number;
  yellowRatio: number;
  whiteRatio: number;
  darkRatio: number;
  neutralRatio: number;
  hash: number[];
};

export type ReferenceIcon = {
  id: string;
  label: string;
  fileName: string;
  width: number;
  height: number;
  previewSrc: string;
  features: VisualFeatures;
};

export type RecognitionResult = {
  label: string;
  confidence: number;
  source: RecognitionSource;
};

const HASH_SIZE = 16;

export function extractVisualFeatures(imageData: ImageDataLike): VisualFeatures {
  const { width, height, data } = imageData;
  const pixels = Math.max(1, width * height);
  let redCount = 0;
  let blueCount = 0;
  let greenCount = 0;
  let yellowCount = 0;
  let whiteCount = 0;
  let darkCount = 0;
  let neutralCount = 0;
  let saturationSum = 0;
  let edgeCount = 0;
  const hashBuckets = Array.from({ length: HASH_SIZE * HASH_SIZE }, () => ({
    total: 0,
    count: 0
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luma = getLuma(red, green, blue);
      const saturation = getSaturation(red, green, blue);
      saturationSum += saturation;

      if (red > 120 && red > green * 1.45 && red > blue * 1.45) {
        redCount += 1;
      }
      if (blue > 105 && blue > red * 1.2 && blue > green * 1.05) {
        blueCount += 1;
      }
      if (green > 105 && green > red * 1.15 && green > blue * 1.05) {
        greenCount += 1;
      }
      if (red > 135 && green > 105 && blue < 95) {
        yellowCount += 1;
      }
      if (luma > 210 && saturation < 0.24) {
        whiteCount += 1;
      }
      if (luma < 58) {
        darkCount += 1;
      }
      if (saturation < 0.18) {
        neutralCount += 1;
      }

      if (x > 0 && y > 0) {
        const previousLuma = getLumaAt(data, index - 1);
        const topLuma = getLumaAt(data, index - width);
        if (Math.abs(luma - previousLuma) + Math.abs(luma - topLuma) > 82) {
          edgeCount += 1;
        }
      }

      const hashX = Math.min(HASH_SIZE - 1, Math.floor((x / width) * HASH_SIZE));
      const hashY = Math.min(HASH_SIZE - 1, Math.floor((y / height) * HASH_SIZE));
      const bucket = hashBuckets[hashY * HASH_SIZE + hashX];
      bucket.total += luma;
      bucket.count += 1;
    }
  }

  const hash = hashBuckets.map((bucket) => (bucket.count === 0 ? 0 : bucket.total / bucket.count / 255));

  return {
    width,
    height,
    aspectRatio: width / Math.max(1, height),
    edgeDensity: edgeCount / pixels,
    meanSaturation: saturationSum / pixels,
    redRatio: redCount / pixels,
    blueRatio: blueCount / pixels,
    greenRatio: greenCount / pixels,
    yellowRatio: yellowCount / pixels,
    whiteRatio: whiteCount / pixels,
    darkRatio: darkCount / pixels,
    neutralRatio: neutralCount / pixels,
    hash
  };
}

export function recognizeIcon(
  features: VisualFeatures,
  references: ReferenceIcon[]
): RecognitionResult {
  const referenceMatch = findBestReferenceMatch(features, references);

  if (referenceMatch && referenceMatch.confidence >= 0.62) {
    return referenceMatch;
  }

  const heuristic = recognizeByHeuristic(features);

  if (
    referenceMatch &&
    referenceMatch.confidence >= 0.5 &&
    referenceMatch.confidence >= heuristic.confidence
  ) {
    return referenceMatch;
  }

  return heuristic;
}

export function labelFromFileName(fileName: string): string {
  const clean = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "Reference icon";
  }

  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findBestReferenceMatch(
  features: VisualFeatures,
  references: ReferenceIcon[]
): RecognitionResult | null {
  let best: RecognitionResult | null = null;

  for (const reference of references) {
    const similarity = compareFeatures(features, reference.features);

    if (!best || similarity > best.confidence) {
      best = {
        label: reference.label,
        confidence: similarity,
        source: "reference"
      };
    }
  }

  return best;
}

function compareFeatures(a: VisualFeatures, b: VisualFeatures): number {
  const hashSimilarity = 1 - averageHashDistance(a.hash, b.hash);
  const colorSimilarity =
    1 -
    averageAbsoluteDifference([
      a.redRatio - b.redRatio,
      a.blueRatio - b.blueRatio,
      a.greenRatio - b.greenRatio,
      a.yellowRatio - b.yellowRatio,
      a.whiteRatio - b.whiteRatio,
      a.darkRatio - b.darkRatio,
      a.neutralRatio - b.neutralRatio
    ]);
  const edgeSimilarity = 1 - Math.min(1, Math.abs(a.edgeDensity - b.edgeDensity) * 5);
  const aspectSimilarity = Math.exp(-Math.abs(Math.log(a.aspectRatio / b.aspectRatio)) * 0.7);

  return clamp01(
    hashSimilarity * 0.43 + colorSimilarity * 0.32 + edgeSimilarity * 0.13 + aspectSimilarity * 0.12
  );
}

function recognizeByHeuristic(features: VisualFeatures): RecognitionResult {
  const candidates: RecognitionResult[] = [
    {
      label: "Netflix",
      confidence: clamp01(
        features.redRatio * 2.3 + features.darkRatio * 0.35 - features.blueRatio * 0.35
      ),
      source: "heuristic"
    },
    {
      label: "YouTube",
      confidence: clamp01(features.redRatio * 1.7 + features.whiteRatio * 0.55 - features.darkRatio * 0.12),
      source: "heuristic"
    },
    {
      label: "Settings",
      confidence: clamp01(
        features.neutralRatio * 0.42 +
          features.edgeDensity * 1.9 +
          features.whiteRatio * 0.2 -
          features.redRatio * 0.55 -
          features.blueRatio * 0.18
      ),
      source: "heuristic"
    },
    {
      label: "App icon",
      confidence: clamp01(features.meanSaturation * 0.42 + features.edgeDensity * 0.7),
      source: "heuristic"
    }
  ];

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];

  if (best.confidence >= 0.42) {
    return best;
  }

  return {
    label: "Unknown icon",
    confidence: 0,
    source: "unknown"
  };
}

function averageHashDistance(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let total = 0;

  for (let index = 0; index < length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }

  return total / Math.max(1, length);
}

function averageAbsoluteDifference(values: number[]): number {
  return values.reduce((total, value) => total + Math.abs(value), 0) / values.length;
}

function getLumaAt(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return getLuma(data[offset], data[offset + 1], data[offset + 2]);
}

function getLuma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function getSaturation(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
