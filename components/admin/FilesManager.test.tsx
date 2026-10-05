// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { FilesManager, type AdminFileRow } from "./FilesManager";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/modules/files/actions", () => ({
  uploadFileAction: vi.fn(),
  deleteFileAction: vi.fn(),
}));

const t = getDictionary("en");
const f = t.admin.files;

const categories = [
  { id: "avatar", label: f.categories.avatar },
  { id: "attachment", label: f.categories.attachment },
];

const rows: AdminFileRow[] = [
  {
    id: "f1",
    key: "avatar/2026/10/abc.jpg",
    category: "avatar",
    link: "/api/files?key=avatar%2F2026%2F10%2Fabc.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4096,
    width: 256,
    height: 256,
    visibility: "public",
    ownerUsername: "alice",
    createdAt: "2026-10-05T09:00:00.000Z",
  },
  {
    id: "f2",
    key: "attachment/2026/10/def.pdf",
    category: "attachment",
    link: "/api/files?key=attachment%2F2026%2F10%2Fdef.pdf&exp=1&sig=ab",
    mimeType: "application/pdf",
    sizeBytes: 1_572_864,
    width: null,
    height: null,
    visibility: "private",
    ownerUsername: null,
    createdAt: "2026-10-04T09:00:00.000Z",
  },
];

function renderManager(props: Partial<Parameters<typeof FilesManager>[0]> = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>
        <FilesManager rows={rows} categories={categories} activeCategory={null} {...props} />
      </ToastProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
});

afterEach(cleanup);

describe("FilesManager", () => {
  it("lists each file with its category, size, owner and dimensions", () => {
    renderManager();

    expect(screen.getByText("avatar/2026/10/abc.jpg")).toBeDefined();
    expect(screen.getByText("attachment/2026/10/def.pdf")).toBeDefined();
    expect(screen.getAllByText(f.categories.avatar).length).toBeGreaterThan(0);
    expect(screen.getByText("4 KB")).toBeDefined();
    expect(screen.getByText("1.5 MB")).toBeDefined();
    expect(screen.getByText("256×256")).toBeDefined();
    expect(screen.getByText("alice")).toBeDefined();
    // A file with no uploader (system/backfill) shows the system label.
    expect(screen.getByText(f.ownerSystem)).toBeDefined();
    expect(screen.getByText("private")).toBeDefined();
  });

  it("renders a PDF row without an <img> preview", () => {
    const { container } = renderManager({ rows: [rows[1]!] });
    expect(container.querySelector("img")).toBeNull();
  });

  it("copies an absolute link to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderManager({ rows: [rows[0]!] });
    fireEvent.click(screen.getByRole("button", { name: f.copyLink }));

    expect(writeText).toHaveBeenCalledWith(
      new URL("/api/files?key=avatar%2F2026%2F10%2Fabc.jpg", window.location.origin).toString(),
    );
  });

  it("navigates when a category filter is chosen", () => {
    renderManager({ activeCategory: "attachment" });
    fireEvent.click(screen.getByRole("button", { name: f.allCategories }));
    expect(push).toHaveBeenCalledWith("/admin/files");

    fireEvent.click(screen.getByRole("button", { name: f.categories.avatar }));
    expect(push).toHaveBeenCalledWith("/admin/files?category=avatar");
  });

  it("shows the empty state when there is nothing to list", () => {
    renderManager({ rows: [] });
    expect(screen.getByText(f.empty)).toBeDefined();
  });

  it("keeps the upload button disabled until a file is picked", () => {
    renderManager();
    const submit = screen.getByRole("button", { name: f.uploadButton }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
