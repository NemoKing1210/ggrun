"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Modal } from "@/components/ui/Modal";
import { Range } from "@/components/ui/Range";

export interface ImageCropperLabels {
  title: string;
  zoom: string;
  apply: string;
  cancel: string;
  working: string;
  error: string;
  hint: string;
}

type Props = {
  /** Data URL of the source image. The cropper is rendered only while this is non-null. */
  src: string | null;
  open: boolean;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  labels: ImageCropperLabels;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
};

const MAX_OUTPUT_BYTES = 600_000;

function loadImage(src: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("decode-failed"));
  img.crossOrigin = "anonymous";
  img.src = src;
  return promise;
}

/**
 * Rasterises the requested pixel crop of the source image onto an output canvas
 * sized to `outputWidth × outputHeight` and returns a JPEG data URL.
 *
 * Two passes are used to keep file size under the limit: it tries q=0.85, then
 * steps the quality down (and finally downscales) if the encoded data URL still
 * exceeds `MAX_OUTPUT_BYTES`.
 */
async function renderCrop(
  src: string,
  crop: Area,
  outputWidth: number,
  outputHeight: number,
): Promise<string> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const qualities = [0.85, 0.75, 0.65, 0.55];
  for (const q of qualities) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_OUTPUT_BYTES) return url;
  }

  // Last resort: halve the output dimensions and retry once at q=0.7.
  const small = document.createElement("canvas");
  small.width = Math.max(64, Math.round(outputWidth / 2));
  small.height = Math.max(64, Math.round(outputHeight / 2));
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("no-canvas");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.7);
}

/** Modal image cropper with a zoom slider and aspect lock. */
export function ImageCropper({
  src,
  open,
  aspect,
  outputWidth,
  outputHeight,
  labels,
  onApply,
  onClose,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setWorking(false);
      setError(null);
    }
  }, [open]);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = useCallback(async () => {
    if (!src || !croppedAreaPixels) return;
    setWorking(true);
    setError(null);
    try {
      const dataUrl = await renderCrop(src, croppedAreaPixels, outputWidth, outputHeight);
      onApply(dataUrl);
    } catch {
      setError(labels.error);
    } finally {
      setWorking(false);
    }
  }, [src, croppedAreaPixels, outputWidth, outputHeight, onApply, labels.error]);

  const visible = open && src !== null;

  return (
    <Modal
      open={visible}
      onClose={working ? () => undefined : onClose}
      panelClassName="max-w-2xl"
      labelledBy="image-cropper-title"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2
          id="image-cropper-title"
          className="font-display text-lg uppercase tracking-widest text-amber"
        >
          {labels.title}
        </h2>
        <div className="relative h-72 w-full overflow-hidden border border-[#3d3d34] bg-black sm:h-96">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              restrictPosition
              showGrid={false}
              objectFit="contain"
            />
          ) : null}
        </div>
        <p className="text-xs text-dim">{labels.hint}</p>
        <div className="flex items-center gap-3">
          <label className="font-display text-xs uppercase tracking-widest text-zinc-400">
            {labels.zoom}
          </label>
          <Range
            value={zoom}
            min={1}
            max={3}
            step={0.05}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="hud-btn !py-1.5 !px-4 text-xs"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={working}
            className="hud-btn hud-btn-primary !py-1.5 !px-4 text-xs disabled:opacity-50"
          >
            {working ? labels.working : labels.apply}
          </button>
        </div>
      </div>
    </Modal>
  );
}
