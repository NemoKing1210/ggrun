// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCropper, type ImageCropperLabels } from "./ImageCropper";

vi.mock("react-easy-crop", () => ({
  default: (props: {
    aspect: number;
    image: string;
    onCropComplete: (
      area: { x: number; y: number; width: number; height: number },
      pixels: { x: number; y: number; width: number; height: number },
    ) => void;
  }) => (
    <div data-testid="cropper" data-aspect={String(props.aspect)} data-image={props.image}>
      <button
        type="button"
        onClick={() =>
          props.onCropComplete(
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 1, y: 2, width: 8, height: 8 },
          )
        }
      >
        mock-crop
      </button>
    </div>
  ),
}));

const labels: ImageCropperLabels = {
  title: "Crop avatar",
  zoom: "Zoom",
  apply: "Apply",
  cancel: "Cancel",
  working: "Working…",
  error: "That image could not be processed",
  hint: "Drag to reposition",
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

let setContextReturn: (value: CanvasRenderingContext2D | null) => void;

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      drawImage: vi.fn(),
      imageSmoothingQuality: "high",
    } as unknown as CanvasRenderingContext2D);
  setContextReturn = (value) => {
    spy.mockReturnValue(value as CanvasRenderingContext2D);
  };
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,short",
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderCropper(src: string | null = "data:image/png;base64,source") {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ImageCropper
      src={src}
      open
      aspect={1}
      outputWidth={256}
      outputHeight={256}
      labels={labels}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { ...view, onApply, onClose };
}

describe("ImageCropper", () => {
  it("renders the modal chrome, labels and cropper while open", () => {
    renderCropper();
    expect(screen.getByText("Crop avatar")).toBeTruthy();
    expect(screen.getByText("Drag to reposition")).toBeTruthy();
    expect(screen.getByTestId("cropper").getAttribute("data-aspect")).toBe("1");
  });

  it("renders nothing when there is no source", () => {
    renderCropper(null);
    expect(screen.queryByText("Crop avatar")).toBeNull();
  });

  it("does not apply before a crop area is reported", () => {
    const { onApply } = renderCropper();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("rasterises the crop and hands the data URL to onApply", async () => {
    const { onApply } = renderCropper();
    fireEvent.click(screen.getByText("mock-crop"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith("data:image/jpeg;base64,short"),
    );
  });

  it("shows the error label when canvas rendering fails", async () => {
    setContextReturn(null);
    renderCropper();
    fireEvent.click(screen.getByText("mock-crop"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(labels.error),
    );
  });

  it("cancels through the cancel button", () => {
    const { onClose } = renderCropper();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
