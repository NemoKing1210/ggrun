"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/outline";

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

export function GlobalChat({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
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

 // block page scroll when panel open (body lock + iOS touch guard)
 useEffect(() => {
 if (!open) return;
 const prevBody = document.body.style.overflow;
 const prevHtml = document.documentElement.style.overflow;
 const prevPad = document.body.style.paddingRight;
 const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
 document.body.style.overflow = "hidden";
 document.documentElement.style.overflow = "hidden";
 document.body.style.overscrollBehavior = "none";
 if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
 // iOS: prevent scroll outside the message list
 const onTouchMove = (e: TouchEvent) => {
 const t = e.target as Node | null;
 if (listRef.current && t && listRef.current.contains(t)) return;
 e.preventDefault();
 };
 document.addEventListener("touchmove", onTouchMove, { passive: false });
 return () => {
 document.body.style.overflow = prevBody;
 document.documentElement.style.overflow = prevHtml;
 document.body.style.paddingRight = prevPad;
 document.body.style.overscrollBehavior = "";
 document.removeEventListener("touchmove", onTouchMove);
 };
 }, [open]);

  // Esc to close + autofocus composer
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // focus composer next frame
    requestAnimationFrame(() => composerRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const canSend = isAuthenticated && input.trim().length > 0 && input.trim().length <= 1000 && !sending;

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
      {/* Floating button — HUD tactical, animated amber breathing */}
      <div className="group/btn fixed bottom-5 right-5 z-40 flex items-center">
        {/* hover label (desktop) */}
        <span
          className={[
            "pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap border border-amber/30 bg-[#0e0e0d] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-amber shadow-[0_4px_16px_rgba(0,0,0,0.6)] transition-all duration-200 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] sm:block",
            open ? "translate-x-2 opacity-0" : "translate-x-0 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-0",
          ].join(" ")}
          aria-hidden
        >
          {unread > 0 ? `${unread > 99 ? "99+" : unread} · ${chatT.title}` : chatT.title} <span className="opacity-60">— {chatT.hint}</span>
        </span>

        <div className="relative">
          {/* ping ring when unread */}
          {unread > 0 && !open && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-chat-ping border-2 border-amber [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]"
            />
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? chatT.close : chatT.title}
            aria-expanded={open}
            className={[
              "relative flex size-14 items-center justify-center border-2 bg-gradient-to-br from-[#1e1e18] to-[#0a0a08] text-amber shadow-[0_8px_28px_rgba(0,0,0,0.6)] transition-all duration-200 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]",
              "hover:scale-[1.07] hover:from-amber hover:to-[#e8a600] hover:text-black hover:shadow-[0_10px_36px_rgba(242,169,0,0.45)] active:scale-[0.97]",
              open ? "border-amber bg-amber text-black shadow-[0_0_24px_rgba(242,169,0,0.5)]" : "animate-chat-amber",
            ].join(" ")}
          >
            {/* corner ticks */}
            <span className="pointer-events-none absolute left-0 top-0 h-2.5 w-2.5 border-l-2 border-t-2 border-amber/70 group-hover/btn:border-black/30" aria-hidden />
            <span className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-amber/70 group-hover/btn:border-black/30" aria-hidden />
            {/* inner highlight */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-[2px] border border-white/10 [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)] opacity-30 group-hover/btn:opacity-20"
            />
            {/* icon morph */}
            <span className="relative flex items-center justify-center">
              <ChatBubbleLeftRightIcon
                className={[
                  "size-7 drop-shadow-[0_1px_6px_rgba(242,169,0,0.35)] transition-all duration-200",
                  open ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100 group-hover/btn:scale-110 group-hover/btn:-rotate-3",
                ].join(" ")}
                aria-hidden
              />
              <XMarkIcon
                className={[
                  "absolute size-7 transition-all duration-200",
                  open ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0",
                ].join(" ")}
                aria-hidden
              />
            </span>
            {/* unread badge */}
            {unread > 0 && !open && (
              <span className="absolute -right-1.5 -top-1.5 flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-amber px-1 py-0.5 font-mono text-[11px] font-bold leading-none text-black shadow-[0_2px_12px_rgba(242,169,0,0.65)] animate-chat-badge">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
            {/* active dot when open */}
            {open && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Panel — slides from right — HUD tactical */}
      <div
        aria-hidden={!open}
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l-2 border-amber/25 bg-[#0a0a08] shadow-[0_0_48px_rgba(0,0,0,0.85),0_0_24px_rgba(242,169,0,0.10)] transition-transform duration-300 ease-out",
          "[clip-path:polygon(12px_0,100%_0,100%_100%,0_100%,0_12px)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* hazard tape + top glow */}
        <div className="hazard-tape h-[3px] shrink-0 opacity-90" aria-hidden />
        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-amber/30 to-transparent" aria-hidden />
        {/* Header — amber tinted, with live indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-amber/10 bg-gradient-to-r from-[#151510] via-[#1a1a12] to-[#151510] px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 items-center justify-center border border-amber/25 bg-amber/10 text-amber shadow-[0_0_12px_rgba(242,169,0,0.18)] [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)] shrink-0">
              <ChatBubbleLeftRightIcon className="size-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-display text-[13px] uppercase tracking-[0.18em] text-amber leading-none">{chatT.title}</p>
                <span className="hidden sm:inline-flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" aria-hidden />
                  LIVE
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-dim/80 flex items-center gap-2">
                <span className="hidden sm:inline">{chatT.hint}</span>
                <span className="size-1 rounded-full bg-dim/30 hidden sm:inline-block" aria-hidden />
                <span className="text-dim/60">{msgs.length > 0 ? msgs.length + ' msgs' : '—'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={chatT.close}
            className="inline-flex size-9 items-center justify-center border border-[#2a2a21] bg-[#1c1c18] text-dim hover:border-amber/30 hover:bg-amber hover:text-black transition-colors [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)] shrink-0"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[#080807] px-3 py-3 scrollbar-thin">
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
              className="mx-auto mb-3 inline-flex items-center gap-1.5 border border-amber/20 bg-[#1a1a14] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim hover:border-amber/30 hover:text-amber disabled:opacity-60 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {loadingMore ? chatT.loading : chatT.loadMore}
            </button>
          )}

          {loading ? (
            <div className="space-y-2 py-6">
              {[0,1,2].map((i) => (
                <div key={i} className="animate-pulse flex gap-2.5 border border-[#1e1e18] bg-[#121210] p-2.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <div className="size-7 shrink-0 bg-[#1e1e18]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-[#1e1e18]" />
                    <div className="h-3 w-full bg-[#1a1a16]" />
                    <div className="h-3 w-3/4 bg-[#1a1a16]" />
                  </div>
                </div>
              ))}
            </div>
          ) : msgs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
              <div className="flex size-12 items-center justify-center border border-amber/15 bg-amber/5 text-amber/60 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                <ChatBubbleLeftRightIcon className="size-6" />
              </div>
              <p className="mt-4 font-display text-xs uppercase tracking-[0.16em] text-dim">{chatT.empty}</p>
              <p className="mt-1.5 max-w-[26ch] font-mono text-[11px] leading-relaxed text-dim/60">{chatT.hint}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {msgs.map((m) => {
                const label = m.displayName ?? m.username;
                const initials = label.slice(0, 2).toUpperCase();
                const roleColor = m.role === "admin" ? "text-red-400" : m.role === "judge" ? "text-violet-400" : "text-amber";
                return (
                  <div
                    key={m.id}
                    className="group/msg flex gap-2.5 border border-[#1e1e18] bg-[#121210] p-2.5 transition-colors hover:border-amber/15 hover:bg-[#191913] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  >
                    <Link
                      href={`/players/${m.username}`}
                      className="shrink-0"
                      onClick={() => setOpen(false)}
                    >
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatarUrl} alt={label} className="size-8 object-cover ring-1 ring-white/5 group-hover/msg:ring-amber/20 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" />
                      ) : (
                        <span className="inline-flex size-8 items-center justify-center bg-[#1e1e18] font-display text-[11px] tracking-widest text-dim ring-1 ring-white/5 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                          {initials}
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/players/${m.username}`}
                          onClick={() => setOpen(false)}
                          className={"truncate font-display text-[12px] uppercase tracking-wide hover:underline " + roleColor}
                        >
                          {label}
                        </Link>
                        <span className="font-mono text-[10px] tracking-widest text-dim/50">@{m.username}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] tracking-widest text-dim/40">{timeLabel(m.createdAt, locale)}</span>
                      </div>
                      <p className="mt-0.5 break-words font-mono text-[12px] leading-relaxed text-zinc-200">{m.content}</p>
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
              className="sticky bottom-2 z-10 mx-auto mt-3 inline-flex items-center gap-1.5 border border-amber/20 bg-amber px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-black shadow-[0_6px_20px_rgba(0,0,0,0.5)] hover:bg-amber/90 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
            >
              {format(chatT.newMessages, { count: String(unread) })} <span aria-hidden>↓</span>
            </button>
          )}
        </div>

        {/* Composer — HUD inset */}
        <div className="shrink-0 border-t border-amber/10 bg-gradient-to-b from-[#151510] to-[#10100e] p-3">
          {error && <p className="mb-2 border-l-2 border-red-500/40 bg-red-500/5 px-2.5 py-1.5 font-mono text-[11px] leading-snug text-red-300">{error}</p>}
          {/* Composer input — button inside */}
          <div className="relative">
            <textarea
              ref={composerRef}
              disabled={!isAuthenticated}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSend();
                }
              }}
              rows={3}
              maxLength={1000}
              placeholder={isAuthenticated ? chatT.placeholder : chatT.loginHint}
              className="min-h-[64px] max-h-36 w-full resize-none border border-[#2a2a21] bg-[#080807] px-3.5 py-3 pr-[56px] font-mono text-[13px] leading-relaxed text-zinc-100 placeholder:text-dim/50 focus:border-amber/30 focus:outline-none focus:ring-1 focus:ring-amber/15 disabled:opacity-60 disabled:cursor-not-allowed [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
            />
            <div className="pointer-events-none absolute inset-0 border border-transparent [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]" aria-hidden />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={chatT.send}
              className="absolute bottom-3 right-2 inline-flex size-9 items-center justify-center border border-amber bg-amber text-black shadow-[0_4px_14px_rgba(242,169,0,0.30)] hover:bg-amber/90 hover:shadow-[0_6px_18px_rgba(242,169,0,0.35)] active:scale-[0.96] disabled:opacity-40 disabled:shadow-none [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] transition-all"
            >
              <PaperAirplaneIcon className="size-[18px] translate-x-px" />
            </button>
          </div>
          {(() => {
            const len = input.trim().length;
            const pct = len / 1000;
            const col = pct > 0.95 ? "text-red-400" : pct > 0.8 ? "text-amber" : "text-dim/60";
            return (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className={"font-mono text-[10px] tracking-widest transition-colors " + col}>{len}/1000</p>
                <p className="font-mono text-[10px] tracking-widest text-dim/40 hidden sm:block">Shift+Enter — новая строка</p>
              </div>
            );
          })()}
          {!isAuthenticated && (
            <p className="mt-2 flex items-center gap-2 border border-amber/15 bg-amber/5 px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-amber/80 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <span className="size-1.5 rounded-full bg-amber animate-pulse" aria-hidden />
              {chatT.loginHint} —{" "}
              <Link href="/login" className="underline decoration-dotted underline-offset-2 hover:text-amber">
                {chatT.loginAction}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Backdrop when open */}
      {open && <button aria-label={chatT.close} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />}
    </>
  );
}
