// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { CHAT_ROOM, type ChatMessageBroadcast } from "@/lib/realtime/protocol";

const rt = vi.hoisted(() => ({
  connected: true,
  connects: 1,
  socket: { emit: vi.fn() },
  handlers: [] as Array<{ room: string | null; event: string; handler: (payload: unknown) => void }>,
  fire(room: string, event: string, payload: unknown) {
    for (const h of rt.handlers) {
      if (h.room === room && h.event === event) h.handler(payload);
    }
  },
  reset() {
    rt.handlers = [];
    rt.socket.emit.mockClear();
    rt.connected = true;
    rt.connects = 1;
  },
}));

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({ socket: rt.socket, connected: rt.connected, connects: rt.connects }),
  useRealtimeConnects: () => rt.connects,
  useRealtimeEvent: (room: string | null, event: string, handler: (payload: unknown) => void) => {
    rt.handlers.push({ room, event, handler });
  },
  usePresence: () => null,
}));

import { GlobalChat } from "./GlobalChat";

const t = getDictionary("en");
const chatT = t.chat;

const fetchMock = vi.hoisted(() => vi.fn());

type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const jsonResponse = (body: unknown, status = 200): JsonResponse => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const msg = (over: Partial<ChatMessageBroadcast> = {}): ChatMessageBroadcast => ({
  id: "m1",
  userId: "u2",
  content: "hello channel",
  createdAt: new Date().toISOString(),
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  role: "player",
  ...over,
});

const renderChat = (isAuthenticated = true) =>
  render(
    <I18nProvider locale="en" t={t}>
      <GlobalChat isAuthenticated={isAuthenticated} currentUserId="me" />
    </I18nProvider>,
  );

const openDrawer = () => fireEvent.click(screen.getByRole("button", { name: chatT.title }));

const drawerIsOpen = () => document.querySelector('button[aria-expanded="true"]') !== null;

beforeEach(() => {
  rt.reset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(Element.prototype, "scrollTo", { value: vi.fn(), writable: true });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GlobalChat", () => {
  it("opens the drawer and loads the first page from the API", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [msg()], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    expect(drawerIsOpen()).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/chat?limit=30", { cache: "no-store" }));
    expect(await screen.findByText("hello channel")).toBeTruthy();
    expect(screen.getByText(format(chatT.messageCount, { count: "1" }))).toBeTruthy();
  });

  it("posts the typed message and clears the composer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const sent = msg({ id: "m2", userId: "me", content: "ping", username: "me", displayName: "Me" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: sent }));
    const textarea = screen.getByPlaceholderText(chatT.placeholder) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: chatT.send }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ content: "ping" });
    await waitFor(() => expect((screen.getByPlaceholderText(chatT.placeholder) as HTMLTextAreaElement).value).toBe(""));
  });

  it("renders the login hint when the server rejects with 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    const textarea = screen.getByPlaceholderText(chatT.placeholder);
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: chatT.send }));
    expect(await screen.findByText(chatT.loginHint)).toBeTruthy();
  });

  it("renders the rate-limit message on 429", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
    fireEvent.change(screen.getByPlaceholderText(chatT.placeholder), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: chatT.send }));
    expect(await screen.findByText(chatT.rateLimited)).toBeTruthy();
  });

  it("disables the composer and points to login for guests", () => {
    renderChat(false);
    openDrawer();
    const textarea = screen.getByPlaceholderText(chatT.loginHint) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(screen.getByRole("link", { name: chatT.loginAction }).getAttribute("href")).toBe("/login");
  });

  it("raises an unread badge and alert for a message while closed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    const { container } = renderChat();
    act(() => {
      rt.fire(CHAT_ROOM, "chat:message", msg({ id: "m9", content: "secret drop" }));
    });
    const badge = container.querySelector(".animate-chat-badge");
    expect(badge?.textContent).toBe("1");
    expect(screen.getAllByText("secret drop").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText(format(chatT.notifyAria, { name: "Ada", text: "secret drop" })));
    expect(drawerIsOpen()).toBe(true);
  });

  it("does not raise an alert card for its own message", () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    act(() => {
      rt.fire(CHAT_ROOM, "chat:message", msg({ id: "m10", userId: "me", content: "mine" }));
    });
    expect(screen.queryByLabelText(format(chatT.notifyAria, { name: "Ada", text: "mine" }))).toBeNull();
  });

  it("shows who is typing while the drawer is open", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    act(() => {
      rt.fire(CHAT_ROOM, "chat:typing", { userId: "u3", username: "bob", displayName: "Bob" });
    });
    expect(screen.getByText(format(chatT.typingOne, { name: "Bob" }))).toBeTruthy();
  });

  it("emits a typing hint while composing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    fireEvent.change(screen.getByPlaceholderText(chatT.placeholder), { target: { value: "typing" } });
    expect(rt.socket.emit).toHaveBeenCalledWith("chat:typing");
  });

  it("reports the disconnected state when the socket is down", () => {
    rt.connected = false;
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], hasMore: false, nextBefore: null }));
    renderChat();
    openDrawer();
    expect(screen.getByText(chatT.reconnecting)).toBeTruthy();
  });
});
