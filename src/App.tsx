import {
  ChangeEvent,
  DragEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  BadgePlus,
  Check,
  Download,
  FileJson,
  Image as ImageIcon,
  RotateCcw,
  ScanLine,
  Scissors,
  Settings2,
  Square,
  Tags,
  Upload,
  X
} from "lucide-react";
import {
  DEFAULT_DETECTION_OPTIONS,
  detectIconCandidates,
  DetectionOptions
} from "./lib/detectElements";
import { downloadCropsAsZip, downloadManifest } from "./lib/exportElements";
import {
  extractVisualFeatures,
  labelFromFileName,
  recognizeIcon,
  ReferenceIcon
} from "./lib/recognizeIcons";
import { Rect, reindexRects } from "./lib/rect";

const PROCESS_MAX_DIMENSION = 2200;

type LoadState = {
  image: HTMLImageElement;
  src: string;
  name: string;
};

type Status = {
  label: string;
  tone: "idle" | "busy" | "ok" | "error";
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [detections, setDetections] = useState<Rect[]>([]);
  const [referenceIcons, setReferenceIcons] = useState<ReferenceIcon[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ label: "Ready", tone: "idle" });
  const [options, setOptions] = useState<DetectionOptions>(DEFAULT_DETECTION_OPTIONS);

  const selectedRects = useMemo(
    () => detections.filter((rect) => selectedIds.has(rect.id)),
    [detections, selectedIds]
  );

  const runDetection = useCallback(() => {
    if (!loadState) {
      return;
    }

    setStatus({ label: "Scanning", tone: "busy" });

    window.requestAnimationFrame(async () => {
      try {
        const rects = detectFromImage(loadState.image, options);
        const recognized = await recognizeRectsFromImage(loadState.image, rects, referenceIcons);
        setDetections(recognized);
        setSelectedIds(new Set(recognized.map((rect) => rect.id)));
        setStatus({
          label: `${recognized.length} icon${recognized.length === 1 ? "" : "s"} found`,
          tone: "ok"
        });
      } catch (error) {
        setStatus({
          label: error instanceof Error ? error.message : "Detection failed",
          tone: "error"
        });
      }
    });
  }, [loadState, options, referenceIcons]);

  useEffect(() => {
    if (!loadState || detections.length === 0) {
      return;
    }

    let cancelled = false;
    const baseRects = detections.map(({ label: _label, confidence: _confidence, recognitionSource: _source, ...rect }) => rect);

    recognizeRectsFromImage(loadState.image, baseRects, referenceIcons).then((recognized) => {
      if (!cancelled) {
        setDetections(recognized);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [referenceIcons]);

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      setStatus({ label: "Choose an image file", tone: "error" });
      return;
    }

    const src = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setLoadState((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous.src);
        }

        return { image, src, name: file.name };
      });
      setDetections([]);
      setSelectedIds(new Set());
      setStatus({ label: "Image loaded", tone: "ok" });
    };
    image.onerror = () => {
      URL.revokeObjectURL(src);
      setStatus({ label: "Image could not be loaded", tone: "error" });
    };
    image.src = src;
  }, []);

  const handleReferenceFiles = useCallback(async (files: FileList | null) => {
    const imageFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      setStatus({ label: "Choose reference icons", tone: "error" });
      return;
    }

    setStatus({ label: "Indexing references", tone: "busy" });

    try {
      const references = await Promise.all(
        imageFiles.map(async (file) => {
          const previewSrc = await readFileAsDataUrl(file);
          const image = await loadImageElement(previewSrc);
          const imageData = imageToImageData(image);

          return {
            id: crypto.randomUUID(),
            label: labelFromFileName(file.name),
            fileName: file.name,
            width: image.naturalWidth,
            height: image.naturalHeight,
            previewSrc,
            features: extractVisualFeatures(imageData)
          };
        })
      );

      setReferenceIcons((current) => [...current, ...references]);
      setStatus({
        label: `${references.length} reference${references.length === 1 ? "" : "s"} added`,
        tone: "ok"
      });
    } catch (error) {
      setStatus({
        label: error instanceof Error ? error.message : "Reference import failed",
        tone: "error"
      });
    }
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || !loadState) {
      return;
    }

    const { image } = loadState;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    context.lineJoin = "round";
    context.font = `${Math.max(14, Math.round(canvas.width / 120))}px system-ui`;

    detections.forEach((rect, index) => {
      const selected = selectedIds.has(rect.id);
      const lineWidth = selected
        ? Math.max(4, Math.round(canvas.width / 420))
        : Math.max(2, Math.round(canvas.width / 720));

      context.save();
      context.lineWidth = lineWidth;
      context.strokeStyle = selected ? "#f05d42" : "#19a187";
      context.fillStyle = selected ? "rgba(240, 93, 66, 0.13)" : "rgba(25, 161, 135, 0.1)";
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.fillRect(rect.x, rect.y, rect.width, rect.height);

      const label = rect.label && rect.label !== "Unknown icon" ? rect.label : String(index + 1).padStart(2, "0");
      const labelWidth = context.measureText(label).width + 14;
      const labelHeight = 24;
      const labelX = rect.x;
      const labelY = Math.max(0, rect.y - labelHeight);
      context.fillStyle = selected ? "#f05d42" : "#19a187";
      context.fillRect(labelX, labelY, labelWidth, labelHeight);
      context.fillStyle = "#ffffff";
      context.fillText(label, labelX + 7, labelY + 17);
      context.restore();
    });
  }, [detections, loadState, selectedIds]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  useEffect(() => {
    return () => {
      if (loadState) {
        URL.revokeObjectURL(loadState.src);
      }
    };
  }, [loadState]);

  const resetOptions = () => {
    setOptions(DEFAULT_DETECTION_OPTIONS);
  };

  const toggleRectAtPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    const hit = [...detections]
      .reverse()
      .find((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);

    if (!hit) {
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(hit.id)) {
        next.delete(hit.id);
      } else {
        next.add(hit.id);
      }

      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(detections.map((rect) => rect.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleZipDownload = async () => {
    if (!loadState || selectedRects.length === 0) {
      return;
    }

    setStatus({ label: "Exporting ZIP", tone: "busy" });

    try {
      await downloadCropsAsZip(loadState.image, selectedRects, loadState.name);
      setStatus({ label: "ZIP exported", tone: "ok" });
    } catch (error) {
      setStatus({
        label: error instanceof Error ? error.message : "Export failed",
        tone: "error"
      });
    }
  };

  const handleManifestDownload = () => {
    if (!loadState || detections.length === 0) {
      return;
    }

    downloadManifest(loadState.image, detections, loadState.name);
    setStatus({ label: "Manifest exported", tone: "ok" });
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const imageMeta = loadState
    ? `${loadState.image.naturalWidth} x ${loadState.image.naturalHeight}`
    : "No image";

  return (
    <main className="app-shell" onDragOver={(event) => event.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <Scissors size={22} aria-hidden="true" />
          <span>TV UI Element Cutter</span>
        </div>

        <div className="toolbar" aria-label="Main actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files)}
          />
          <input
            ref={referenceInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleReferenceFiles(event.target.files)}
          />
          <button
            className="icon-button"
            type="button"
            title="Open image"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={19} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Add reference icons"
            onClick={() => referenceInputRef.current?.click()}
          >
            <BadgePlus size={19} aria-hidden="true" />
          </button>
          <button
            className="icon-button primary"
            type="button"
            title="Find icons"
            disabled={!loadState}
            onClick={runDetection}
          >
            <ScanLine size={19} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Download selected crops"
            disabled={!loadState || selectedRects.length === 0}
            onClick={handleZipDownload}
          >
            <Download size={19} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Download manifest"
            disabled={!loadState || detections.length === 0}
            onClick={handleManifestDownload}
          >
            <FileJson size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="settings-panel" aria-label="Detection settings">
          <PanelHeading icon={<Settings2 size={18} aria-hidden="true" />} title="Settings" />
          <SliderField
            label="Sensitivity"
            value={options.sensitivity}
            min={10}
            max={100}
            step={1}
            onChange={(value) => setOptions((current) => ({ ...current, sensitivity: value }))}
          />
          <SliderField
            label="Min area"
            value={Math.round(options.minAreaRatio * 10000)}
            min={1}
            max={80}
            step={1}
            suffix="bp"
            onChange={(value) =>
              setOptions((current) => ({ ...current, minAreaRatio: value / 10000 }))
            }
          />
          <SliderField
            label="Merge gap"
            value={options.mergeGap}
            min={0}
            max={160}
            step={2}
            suffix="px"
            onChange={(value) => setOptions((current) => ({ ...current, mergeGap: value }))}
          />
          <SliderField
            label="Padding"
            value={options.padding}
            min={0}
            max={48}
            step={1}
            suffix="px"
            onChange={(value) => setOptions((current) => ({ ...current, padding: value }))}
          />
          <SliderField
            label="Max"
            value={options.maxElements}
            min={8}
            max={120}
            step={1}
            onChange={(value) => setOptions((current) => ({ ...current, maxElements: value }))}
          />
          <div className="references-block">
            <div className="references-heading">
              <PanelHeading icon={<Tags size={18} aria-hidden="true" />} title="References" />
              <button
                className="icon-button small"
                type="button"
                title="Add reference icons"
                onClick={() => referenceInputRef.current?.click()}
              >
                <BadgePlus size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="reference-list">
              {referenceIcons.length > 0 ? (
                referenceIcons.map((reference) => (
                  <div className="reference-chip" key={reference.id}>
                    <img src={reference.previewSrc} alt="" />
                    <span>{reference.label}</span>
                    <button
                      className="chip-button"
                      type="button"
                      title={`Remove ${reference.label}`}
                      onClick={() =>
                        setReferenceIcons((current) =>
                          current.filter((item) => item.id !== reference.id)
                        )
                      }
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))
              ) : (
                <button
                  className="reference-empty"
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <BadgePlus size={15} aria-hidden="true" />
                  <span>Add icons</span>
                </button>
              )}
            </div>
          </div>
          <div className="panel-actions">
            <button className="text-button" type="button" onClick={resetOptions}>
              <RotateCcw size={16} aria-hidden="true" />
              <span>Reset</span>
            </button>
            <button className="text-button accent" type="button" disabled={!loadState} onClick={runDetection}>
              <ScanLine size={16} aria-hidden="true" />
              <span>Scan</span>
            </button>
          </div>
        </aside>

        <section
          className={`viewer ${isDragging ? "is-dragging" : ""}`}
          aria-label="Image preview"
          onDrop={handleDrop}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
        >
          {loadState ? (
            <canvas
              ref={canvasRef}
              className="preview-canvas"
              onPointerDown={toggleRectAtPointer}
              aria-label="Detected icons"
            />
          ) : (
            <button
              className="empty-state"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon size={44} aria-hidden="true" />
              <span>Open screenshot</span>
            </button>
          )}
        </section>

        <aside className="elements-panel" aria-label="Detected icons">
          <div className="elements-heading">
            <PanelHeading icon={<ScanLine size={18} aria-hidden="true" />} title="Icons" />
            <div className="selection-actions">
              <button className="icon-button small" type="button" title="Select all" onClick={selectAll}>
                <Check size={15} aria-hidden="true" />
              </button>
              <button className="icon-button small" type="button" title="Clear selection" onClick={clearSelection}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="element-list">
            {detections.length > 0 ? (
              detections.map((rect, index) => (
                <ElementCard
                  key={rect.id}
                  image={loadState?.image ?? null}
                  index={index}
                  rect={rect}
                  selected={selectedIds.has(rect.id)}
                  onToggle={() =>
                    setSelectedIds((current) => {
                      const next = new Set(current);

                      if (next.has(rect.id)) {
                        next.delete(rect.id);
                      } else {
                        next.add(rect.id);
                      }

                      return next;
                    })
                  }
                />
              ))
            ) : (
              <div className="empty-list">
                <Square size={20} aria-hidden="true" />
                <span>No icons</span>
              </div>
            )}
          </div>
        </aside>
      </section>

      <footer className="statusbar">
        <span>{loadState?.name ?? "No file"}</span>
        <span>{imageMeta}</span>
        <span>{detections.length} icons</span>
        <span>{selectedRects.length} selected</span>
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
      </footer>
    </main>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span className="slider-label">
        <span>{label}</span>
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PanelHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-heading">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function ElementCard({
  image,
  rect,
  index,
  selected,
  onToggle
}: {
  image: HTMLImageElement | null;
  rect: Rect;
  index: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = previewRef.current;

    if (!canvas || !image) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const scale = Math.min(1, 180 / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }, [image, rect]);

  return (
    <button className={`element-card ${selected ? "selected" : ""}`} type="button" onClick={onToggle}>
      <div className="element-thumb">
        <canvas ref={previewRef} aria-hidden="true" />
      </div>
      <div className="element-meta">
        <strong>{rect.label ?? `Icon ${String(index + 1).padStart(2, "0")}`}</strong>
        <span className="confidence-line">
          {formatConfidence(rect.confidence ?? 0)} · {rect.recognitionSource ?? "unknown"}
        </span>
        <span>
          {rect.width} x {rect.height}
        </span>
        <span>
          {rect.x}, {rect.y}
        </span>
      </div>
      <span className="selection-mark">{selected ? <Check size={16} /> : <Square size={16} />}</span>
    </button>
  );
}

function detectFromImage(image: HTMLImageElement, options: DetectionOptions): Rect[] {
  const scale = Math.min(
    1,
    PROCESS_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas context is not available.");
  }

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const scaledOptions: DetectionOptions = {
    ...options,
    mergeGap: Math.max(0, Math.round(options.mergeGap * scale)),
    padding: Math.max(0, Math.round(options.padding * scale))
  };
  const detected = detectIconCandidates(imageData, scaledOptions);

  if (scale === 1) {
    return detected;
  }

  const mapped = detected.map((rect) => ({
    ...rect,
    x: Math.round(rect.x / scale),
    y: Math.round(rect.y / scale),
    width: Math.round(rect.width / scale),
    height: Math.round(rect.height / scale),
    area: Math.round(rect.area / (scale * scale))
  }));

  return reindexRects(mapped);
}

async function recognizeRectsFromImage(
  image: HTMLImageElement,
  rects: Rect[],
  references: ReferenceIcon[]
): Promise<Rect[]> {
  return rects.map((rect) => {
    const imageData = imageToImageData(image, rect);
    const recognition = recognizeIcon(extractVisualFeatures(imageData), references);

    return {
      ...rect,
      label: recognition.label,
      confidence: Math.round(recognition.confidence * 100) / 100,
      recognitionSource: recognition.source
    };
  });
}

function imageToImageData(image: HTMLImageElement, rect?: Rect): ImageData {
  const x = rect?.x ?? 0;
  const y = rect?.y ?? 0;
  const width = Math.max(1, rect?.width ?? image.naturalWidth);
  const height = Math.max(1, rect?.height ?? image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas context is not available.");
  }

  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = src;
  });
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
