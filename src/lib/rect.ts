export type Rect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  score: number;
  label?: string;
  confidence?: number;
  recognitionSource?: string;
};

export type RectInput = Omit<Rect, "id" | "area" | "score"> &
  Partial<Pick<Rect, "id" | "area" | "score">>;

export function clampRect(rect: RectInput, imageWidth: number, imageHeight: number): Rect {
  const x = Math.max(0, Math.min(imageWidth, Math.round(rect.x)));
  const y = Math.max(0, Math.min(imageHeight, Math.round(rect.y)));
  const right = Math.max(x, Math.min(imageWidth, Math.round(rect.x + rect.width)));
  const bottom = Math.max(y, Math.min(imageHeight, Math.round(rect.y + rect.height)));
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  const area = rect.area ?? width * height;

  return {
    id: rect.id ?? "",
    x,
    y,
    width,
    height,
    area,
    score: rect.score ?? 0
  };
}

export function padRect(
  rect: RectInput,
  padding: number,
  imageWidth: number,
  imageHeight: number
): Rect {
  return clampRect(
    {
      ...rect,
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    },
    imageWidth,
    imageHeight
  );
}

export function rectsIntersect(a: RectInput, b: RectInput, gap = 0): boolean {
  return (
    a.x - gap <= b.x + b.width &&
    a.x + a.width + gap >= b.x &&
    a.y - gap <= b.y + b.height &&
    a.y + a.height + gap >= b.y
  );
}

export function unionRects(a: RectInput, b: RectInput): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  const area = (a.area ?? a.width * a.height) + (b.area ?? b.width * b.height);

  return {
    id: "",
    x,
    y,
    width: right - x,
    height: bottom - y,
    area,
    score: Math.max(a.score ?? 0, b.score ?? 0)
  };
}

export function reindexRects(rects: Rect[]): Rect[] {
  return rects.map((rect, index) => ({
    ...rect,
    id: `element-${String(index + 1).padStart(3, "0")}`
  }));
}
