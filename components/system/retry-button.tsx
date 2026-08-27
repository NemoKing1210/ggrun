"use client";

/** Full-page reload button for the "site unavailable" screen. */
export function RetryButton({ label }: { label: string }) {
  return (
    <button type="button" className="hud-btn mt-8" onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}