"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubbleLeftRightIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

type ChatMsg = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
};

const PAGE_SIZE = 30;
const POLL_MS = 5000;

function timeLabel(iso: string, locale: string | null): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600000)}h`;
  try {
    return new Intl.DateTimeFormat(locale ?? undefined, { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

export function GlobalChat() {
  const { t, locale } = useI18n();
  const chatT = t.chat;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const initialLoaded = useRef(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
  }, []);

  const fetchPage = useCallback(async (before: string | null, append: "replace" | "prepend") => {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (before) qs.set("before", before);
    const res = await fetch(`/api/chat?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { messages: ChatMsg[]; hasMore: boolean; nextBefore: string | null };
    // API returns messages oldest->newest for the page; normalized to ChatMsg with string date
    const mapped = data.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt).toISOString() }));
    if (append === "replace") {
      setMsgs(mapped);
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
      // after replace, scroll to bottom if first load
      requestAnimationFrame(() => scrollToBottom());
    } else {
      // prepend older messages, keep scroll position stable
      const el = listRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const prevTop = el?.scrollTop ?? 0;
      setMsgs((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const toAdd = mapped.filter((m) => !existing.has(m.id));
        return [...toAdd, ...prev];
      });
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
      requestAnimationFrame(() => {
        if (!el) return;
        const newHeight = el.scrollHeight;
        el.scrollTop = prevTop + (newHeight - prevHeight);
      });
    }
  }, [scrollToBottom]);

  // initial load when panel opens first time or immediately for polling unread? Load lazily on open.
  useEffect(() => {
    if (!open || initialLoaded.current) return;
    initialLoaded.current = true;
    setLoading(true);
    fetchPage(null, "replace").finally(() => setLoading(false));
  }, [open, fetchPage]);

  // observer for lazy loading older messages
  useEffect(() => {
    if (!open || !hasMore || loadingMore) return;
    const sentinel = topSentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextBefore) {
          setLoadingMore(true);
          fetchPage(nextBefore, "prepend").finally(() => setLoadingMore(false));
        }
      },
      { root, threshold: 0.1 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [open, hasMore, nextBefore, loadingMore, fetchPage, msgs.length]);

  // track if at bottom for auto-scroll and unread
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      atBottomRef.current = atBottom;
      if (atBottom) setUnread(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  // poll for new messages when open (and also keep unread when closed via light poll? only when open to save)
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(async () => {
      if (msgs.length === 0) {
        fetchPage(null, "replace");
        return;
      }
      // fetch latest page
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      const res = await fetch(`/api/chat?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMsg[]; hasMore: boolean; nextBefore: string | null };
      const latest = data.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt).toISOString() }));
      const existingIds = new Set(msgs.map((m) => m.id));
      const newOnes = latest.filter((m) => !existingIds.has(m.id));
      if (newOnes.length === 0) return;
      setMsgs((prev) => {
        const prevIds = new Set(prev.map((p) => p.id));
        const filtered = newOnes.filter((n) => !prevIds.has(n.id));
        if (filtered.length === 0) return prev;
        // merge and keep sorted by time, cap to avoid unbounded growth (keep last 300)
        const merged = [...prev, ...filtered].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        return merged.length > 300 ? merged.slice(-300) : merged;
      });
      if (!atBottomRef.current) {
        setUnread((n) => n + newOnes.length);
      } else {
        requestAnimationFrame(() => scrollToBottom(true));
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [open, msgs, fetchPage, scrollToBottom]);

  // when opening, ensure scrolled to bottom
  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollToBottom());
  }, [open, scrollToBottom]);

  const canSend = input.trim().length > 0 && input.trim().length <= 1000 && !sending;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError(chatT.emptyContent);
      return;
    }
    if (trimmed.length > 1000) {
      setError(chatT.tooLong);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setError(chatT.loginHint);
          return;
        }
        if (res.status === 429) {
          setError(chatT.rateLimited);
          return;
        }
        if (data?.error === "CONTENT_TOO_LONG") {
          setError(chatT.tooLong);
          return;
        }
        setError(chatT.error);
        return;
      }
      const msg = data.message as ChatMsg;
      const normalized = { ...msg, createdAt: new Date(msg.createdAt).toISOString() };
      setMsgs((prev) => {
        const next = [...prev, normalized].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        return next.length > 300 ? next.slice(-300) : next;
      });
      setInput("");
      requestAnimationFrame(() => scrollToBottom(true));
    } catch {
      setError(chatT.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating button — bottom-right stack, HUD style */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? chatT.close : chatT.title}
          aria-expanded={open}
          className="group relative flex size-12 items-center justify-center border-2 border-amber/60 bg-[#111110] text-amber shadow-[0_0_20px_rgba(242,169,0,0.35),0_4px_16px_rgba(0,0,0,0.6)] transition hover:border-amber hover:bg-amber hover:text-black [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
        >
          <ChatBubbleLeftRightIcon className="size-6" aria-hidden />
          {unread > 0 && !open && (
            <span className="absolute -right-1 -top-1 flex min-w-5 justify-center rounded-full bg-amber px-1 py-0.5 font-mono text-[11px] font-bold leading-none text-black">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </div>

      {/* Panel — slides from right */}
      <div
        aria-hidden={!open}
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l-2 border-amber/30 bg-[#0e0e0d] shadow-[0_0_40px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-out",
          "[clip-path:polygon(10px_0,100%_0,100%_100%,0_100%,0_10px)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="hazard-tape h-1 shrink-0" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b border-[#2a2a21] bg-[#151510] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center border border-amber/30 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <ChatBubbleLeftRightIcon className="size-4" />
            </div>
            <div>
              <p className="font-display text-[13px] uppercase tracking-[0.18em] text-amber">{chatT.title}</p>
              <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{chatT.hint}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={chatT.close}
            className="inline-flex size-8 items-center justify-center border border-[#2a2a21] bg-raise text-dim hover:border-amber/30 hover:text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[#0e0e0d] px-3 py-3">
          {/* top sentinel for lazy loading */}
          <div ref={topSentinelRef} className="h-px shrink-0" aria-hidden />
          {hasMore && msgs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!nextBefore || loadingMore) return;
                setLoadingMore(true);
                fetchPage(nextBefore, "prepend").finally(() => setLoadingMore(false));
              }}
              disabled={loadingMore}
              className="mx-auto mb-3 border border-[#2a2a21] bg-[#1a1a14] px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-dim hover:border-amber/30 hover:text-amber disabled:opacity-60 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {loadingMore ? chatT.loading : chatT.loadMore}
            </button>
          )}

          {loading ? (
            <p className="py-10 text-center font-mono text-xs tracking-widest text-dim">{chatT.loading}</p>
          ) : msgs.length === 0 ? (
            <p className="mx-auto max-w-[28ch] py-12 text-center font-mono text-xs leading-relaxed tracking-wide text-dim">{chatT.empty}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {msgs.map((m) => {
                const label = m.displayName ?? m.username;
                const initials = label.slice(0, 2).toUpperCase();
                return (
                  <div
                    key={m.id}
                    className="flex gap-2.5 rounded-none border border-[#1e1e18] bg-[#121210] p-2.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  >
                    <Link
                      href={`/players/${m.username}`}
                      className="shrink-0"
                      onClick={() => setOpen(false)}
                    >
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatarUrl} alt={label} className="size-7 object-cover [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" />
                      ) : (
                        <span className="inline-flex size-7 items-center justify-center bg-raised font-display text-[11px] tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                          {initials}
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <Link
                          href={`/players/${m.username}`}
                          onClick={() => setOpen(false)}
                          className="truncate font-display text-[12px] uppercase tracking-wide text-amber hover:underline"
                        >
                          {label}
                        </Link>
                        <span className="font-mono text-[10px] tracking-widest text-dim/70">@{m.username}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] tracking-widest text-dim/60">{timeLabel(m.createdAt, locale)}</span>
                      </div>
                      <p className="break-words font-mono text-xs leading-relaxed text-zinc-200">{m.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unread > 0 && (
            <button
              type="button"
              onClick={() => {
                setUnread(0);
                scrollToBottom(true);
              }}
              className="sticky bottom-2 mx-auto mt-3 border border-amber/30 bg-amber px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-black shadow-[0_4px_16px_rgba(0,0,0,0.6)] hover:bg-amber/90 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {format(chatT.newMessages, { count: String(unread) })} · ↓
            </button>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-[#2a2a21] bg-[#151510] p-3">
          {error && <p className="mb-2 font-mono text-[11px] leading-snug text-red-300">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSend();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder={chatT.placeholder}
              className="min-h-[44px] max-h-24 flex-1 resize-none border border-[#2a2a21] bg-[#0e0e0d] px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 placeholder:text-dim focus:border-amber/40 focus:outline-none [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="shrink-0 border border-amber bg-amber px-4 py-2.5 font-display text-xs uppercase tracking-widest text-black hover:bg-amber/90 disabled:opacity-40 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {sending ? chatT.sending : chatT.send}
            </button>
          </div>
          <p className="mt-1.5 font-mono text-[10px] tracking-widest text-dim/60">{input.trim().length}/1000</p>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-dim/50">
            <Link href="/login" className="underline decoration-dotted underline-offset-2 hover:text-amber">
              {chatT.loginHint}
            </Link>
          </p>
        </div>
      </div>

      {/* Backdrop when open */}
      {open && <button aria-label={chatT.close} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />}
    </>
  );
}
