import { Rect } from "./rect";

export type Point = {
  x: number;
  y: number;
};

export type FocusRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function normalizeFocusRegion(
  start: Point,
  end: Point,
  imageWidth: number,
  imageHeight: number
): FocusRegion {
  const left = clamp(Math.min(start.x, end.x), 0, imageWidth);
  const top = clamp(Math.min(start.y, end.y), 0, imageHeight);
  const right = clamp(Math.max(start.x, end.x), 0, imageWidth);
  const bottom = clamp(Math.max(start.y, end.y), 0, imageHeight);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

export function isUsableFocusRegion(region: FocusRegion): boolean {
  return region.width >= 24 && region.height >= 24;
}

export function fullImageRegion(width: number, height: number): FocusRegion {
  return {
    x: 0,
    y: 0,
    width,
    height
  };
}

export function mapRectFromFocusRegion(rect: Rect, region: FocusRegion, scale: number): Rect {
  return {
    ...rect,
    x: Math.round(rect.x / scale + region.x),
    y: Math.round(rect.y / scale + region.y),
    width: Math.round(rect.width / scale),
    height: Math.round(rect.height / scale),
    area: Math.round(rect.area / (scale * scale))
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
