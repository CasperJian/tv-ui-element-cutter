import { DEFAULT_DETECTION_OPTIONS, detectIconCandidates } from "./detectElements";
import type { FocusRegion } from "./focusRegion";
import { mapRectFromFocusRegion } from "./focusRegion";
import { reindexRects } from "./rect";
import type { Rect, RectCategory } from "./rect";

export type DetectorEngine = "model" | "cv";
export type ModelTarget = "icons" | "components" | "both";

export type ModelDetectionOptions = {
  target: ModelTarget;
  maxElements: number;
};

type ModelBox = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

type ModelDetection = {
  label: string;
  score: number;
  box: ModelBox;
};

type ZeroShotDetector = (
  image: HTMLCanvasElement,
  candidateLabels: string[],
  options?: {
    threshold?: number;
    top_k?: number;
    percentage?: boolean;
  }
) => Promise<ModelDetection[]>;

export const MODEL_DETECTOR_NAME = "Xenova/owlvit-base-patch32";

const MODEL_MAX_DIMENSION = 1280;
const FALLBACK_MAX_DIMENSION = 2200;
const MODEL_THRESHOLD = 0.045;
const DUPLICATE_IOU_THRESHOLD = 0.82;

const ICON_LABELS = [
  "settings icon",
  "app icon",
  "media app logo",
  "streaming service logo",
  "navigation icon",
  "search icon",
  "home icon",
  "profile icon",
  "play icon"
];

const COMPONENT_LABELS = [
  "ui button",
  "app tile",
  "content card",
  "menu item",
  "settings row",
  "navigation tab",
  "screen panel"
];

let detectorPromise: Promise<ZeroShotDetector> | null = null;
let shouldUseLocalFallback = false;

export async function detectWithModel(
  image: HTMLImageElement,
  region: FocusRegion,
  options: ModelDetectionOptions
): Promise<Rect[]> {
  if (shouldUseLocalFallback) {
    return detectWithLocalFallback(image, region, options);
  }

  try {
    const detector = await getDetector();
    const { canvas, scale } = cropRegionToCanvas(image, region, MODEL_MAX_DIMENSION);
    const candidateLabels = labelsForTarget(options.target);
    const output = await detector(canvas, candidateLabels, {
      threshold: MODEL_THRESHOLD,
      top_k: Math.max(options.maxElements * 3, options.maxElements),
      percentage: false
    });
    const rects = output
      .map((detection) => detectionToRect(detection, region, scale, options.target))
      .filter((rect): rect is Rect => rect !== null);

    return reindexRects(removeDuplicateRects(rects).slice(0, options.maxElements));
  } catch {
    detectorPromise = null;
    shouldUseLocalFallback = true;
    console.info("Model detector is unavailable in this browser. Continuing with local icon extraction.");
    return detectWithLocalFallback(image, region, options);
  }
}

async function getDetector(): Promise<ZeroShotDetector> {
  if (!detectorPromise) {
    detectorPromise = import("@huggingface/transformers").then(async ({ env, pipeline }) => {
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      return (await pipeline("zero-shot-object-detection", MODEL_DETECTOR_NAME, {
        device: "wasm",
        dtype: "fp32"
      })) as unknown as ZeroShotDetector;
    });
  }

  return detectorPromise;
}

function cropRegionToCanvas(
  image: HTMLImageElement,
  region: FocusRegion,
  maxDimension: number
): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, maxDimension / Math.max(region.width, region.height));
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is not available.");
  }

  context.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    width,
    height
  );

  return { canvas, scale };
}

function detectWithLocalFallback(
  image: HTMLImageElement,
  region: FocusRegion,
  options: ModelDetectionOptions
): Rect[] {
  const { canvas, scale } = cropRegionToCanvas(image, region, FALLBACK_MAX_DIMENSION);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is not available.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rects = detectIconCandidates(imageData, {
    ...DEFAULT_DETECTION_OPTIONS,
    sensitivity: 82,
    minAreaRatio: 0.00005,
    mergeGap: 8,
    padding: 4,
    maxElements: options.maxElements
  }).map((rect) => {
    const mapped = mapRectFromFocusRegion(rect, region, scale);

    return {
      ...mapped,
      category: "icon" as const,
      label: "Icon",
      confidence: Math.round(mapped.score * 100) / 100,
      recognitionSource: "fallback"
    };
  });

  return reindexRects(removeDuplicateRects(rects).slice(0, options.maxElements));
}

function labelsForTarget(target: ModelTarget): string[] {
  if (target === "icons") {
    return ICON_LABELS;
  }

  if (target === "components") {
    return COMPONENT_LABELS;
  }

  return [...ICON_LABELS, ...COMPONENT_LABELS];
}

function detectionToRect(
  detection: ModelDetection,
  region: FocusRegion,
  scale: number,
  target: ModelTarget
): Rect | null {
  const left = clamp(Math.round(detection.box.xmin / scale + region.x), region.x, region.x + region.width);
  const top = clamp(Math.round(detection.box.ymin / scale + region.y), region.y, region.y + region.height);
  const right = clamp(Math.round(detection.box.xmax / scale + region.x), region.x, region.x + region.width);
  const bottom = clamp(Math.round(detection.box.ymax / scale + region.y), region.y, region.y + region.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  if (width < 4 || height < 4) {
    return null;
  }

  const confidence = Math.round(detection.score * 100) / 100;
  const category = categoryForLabel(detection.label, target);

  return {
    id: "",
    x: left,
    y: top,
    width,
    height,
    area: width * height,
    score: detection.score,
    category,
    label: labelFromPrompt(detection.label),
    confidence,
    recognitionSource: "model"
  };
}

function categoryForLabel(label: string, target: ModelTarget): RectCategory {
  if (target === "icons") {
    return "icon";
  }

  if (target === "components") {
    return "component";
  }

  return COMPONENT_LABELS.includes(label) ? "component" : "icon";
}

function removeDuplicateRects(rects: Rect[]): Rect[] {
  const kept: Rect[] = [];

  for (const rect of [...rects].sort((a, b) => b.score - a.score)) {
    const overlapsExisting = kept.some((candidate) => intersectionOverUnion(rect, candidate) >= DUPLICATE_IOU_THRESHOLD);

    if (!overlapsExisting) {
      kept.push(rect);
    }
  }

  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

function intersectionOverUnion(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;

  return intersection / Math.max(1, union);
}

function labelFromPrompt(label: string): string {
  if (label === "ui button") {
    return "UI button";
  }

  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
