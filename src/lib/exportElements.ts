import JSZip from "jszip";
import { Rect } from "./rect";

export type ExportManifest = {
  source: {
    name: string;
    width: number;
    height: number;
  };
  generatedAt: string;
  elements: Array<{
    id: string;
    label: string;
    confidence: number;
    source: string;
    file: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

export function createManifest(
  image: HTMLImageElement,
  rects: Rect[],
  sourceName: string
): ExportManifest {
  return {
    source: {
      name: sourceName,
      width: image.naturalWidth,
      height: image.naturalHeight
    },
    generatedAt: new Date().toISOString(),
    elements: rects.map((rect, index) => ({
      id: rect.id,
      label: rect.label ?? rect.id,
      confidence: rect.confidence ?? 0,
      source: rect.recognitionSource ?? "unknown",
      file: elementFileName(index, rect.label),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }))
  };
}

export async function downloadCropsAsZip(
  image: HTMLImageElement,
  rects: Rect[],
  sourceName: string
): Promise<void> {
  const zip = new JSZip();
  const manifest = createManifest(image, rects, sourceName);

  for (const [index, rect] of rects.entries()) {
    const blob = await cropToPngBlob(image, rect);
    zip.file(elementFileName(index, rect.label), await blob.arrayBuffer());
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${baseFileName(sourceName)}-ui-elements.zip`);
}

export function downloadManifest(
  image: HTMLImageElement,
  rects: Rect[],
  sourceName: string
): void {
  const manifest = createManifest(image, rects, sourceName);
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json"
  });

  downloadBlob(blob, `${baseFileName(sourceName)}-manifest.json`);
}

export async function cropToPngBlob(image: HTMLImageElement, rect: Rect): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is not available.");
  }

  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export PNG blob."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

export function elementFileName(index: number, label?: string): string {
  const base = label && label !== "Unknown icon" ? slugify(label) : "icon";
  return `${base}-${String(index + 1).padStart(3, "0")}.png`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function baseFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return slugify(withoutExtension) || "tv-screenshot";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
