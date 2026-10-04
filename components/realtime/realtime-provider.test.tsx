// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sock = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const flags = { ackOk: true, defer: false };
  const deferred: Array<() => void> = [];

  function on(event: string, cb: Listener) {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    listeners.set(event, set);
  }

  function off(event: string, cb: Listener) {
    listeners.get(event)?.delete(cb);
  }

  function emit(event: string, ...args: unknown[]) {
    emitted.push({ event, args });
    if (event === "join") {
      const ack = args[1] as ((res: { ok: boolean; error?: string }) => void) | undefined;
      if (typeof ack === "function") {
        const respond = () => ack(flags.ackOk ? { ok: true } : { ok: false, error: "DENIED" });
        if (flags.defer) deferred.push(respond);
        else respond();
      }
    }
  }

  const socket = { on, off, emit, disconnect: vi.fn() };
  const io = vi.fn((_options?: unknown) => socket);

  return {
    socket,
    io,
    emitted,
    joins: () => emitted.filter((e) => e.event === "join").map((e) => e.args[0]),
    leaves: () => emitted.filter((e) => e.event === "leave").map((e) => e.args[0]),
    setAckOk(ok: boolean) {
      flags.ackOk = ok;
    },
    setDefer(defer: boolean) {
      flags.defer = defer;
    },
    flushAcks() {
      for (const respond of deferred.splice(0)) respond();
    },
    reset() {
      listeners.clear();
      emitted.length = 0;
      deferred.length = 0;
      flags.ackOk = true;
      flags.defer = false;
      socket.disconnect.mockClear();
      io.mockClear();
    },
    fire(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
  };
});

vi.mock("socket.io-client", () => ({ io: sock.io }));

import {
  RealtimeProvider,
  useRealtime,
  useRealtimeEvent,
  type JoinAck,
} from "./realtime-provider";
import type { PresenceBroadcast } from "@/lib/realtime/protocol";

function Probe({ room }: { room: string | null }) {
  const { connected, connects, joinRoom, leaveRoom } = useRealtime();
  const [presence, setPresence] = useState<number | null>(null);
  const [ack, setAck] = useState<JoinAck | null>(null);
  useRealtimeEvent(room, "presence:update", (update: PresenceBroadcast) => {
    if (update.room === room) setPresence(update.count);
  });
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="connects">{connects}</span>
      <span data-testid="presence">{presence === null ? "none" : presence}</span>
      <span data-testid="ack">{ack ? (ack.ok ? "ok" : (ack.error ?? "error")) : "none"}</span>
      <button type="button" onClick={() => void joinRoom("manual").then(setAck)}>
        join
      </button>
      <button type="button" onClick={() => leaveRoom("manual")}>
        leave
      </button>
    </div>
  );
}

const mount = (room: string | null = "season:s1") =>
  render(
    <RealtimeProvider>
      <Probe room={room} />
    </RealtimeProvider>,
  );

beforeEach(() => {
  sock.reset();
});

afterEach(() => {
  cleanup();
});

describe("RealtimeProvider", () => {
  it("opens one socket with the reconnect policy and starts offline", () => {
    mount();
    expect(sock.io).toHaveBeenCalledTimes(1);
    expect(sock.io.mock.calls[0]?.[0]).toMatchObject({
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("flips connected and bumps the connect counter on connect", () => {
    mount();
    act(() => sock.fire("connect"));
    expect(screen.getByTestId("connected").textContent).toBe("true");
    expect(screen.getByTestId("connects").textContent).toBe("1");
  });

  it("drops back to offline on disconnect", () => {
    mount();
    act(() => sock.fire("connect"));
    act(() => sock.fire("disconnect"));
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("joins the subscribed room and routes its presence event", () => {
    mount("season:s1");
    expect(sock.joins()).toContain("season:s1");
    act(() => sock.fire("presence:update", { room: "season:s1", count: 4 }));
    expect(screen.getByTestId("presence").textContent).toBe("4");
  });

  it("ignores presence updates for a different room", () => {
    mount("season:s1");
    act(() => sock.fire("presence:update", { room: "chat", count: 9 }));
    expect(screen.getByTestId("presence").textContent).toBe("none");
  });

  it("re-joins every held room on each reconnect", () => {
    mount("season:s1");
    act(() => sock.fire("connect"));
    const afterFirst = sock.joins().filter((r) => r === "season:s1").length;
    act(() => sock.fire("disconnect"));
    act(() => sock.fire("connect"));
    const afterSecond = sock.joins().filter((r) => r === "season:s1").length;
    expect(afterSecond).toBeGreaterThan(afterFirst);
  });

  it("leaves the room when the last subscriber unmounts", async () => {
    function Solo() {
      const [show, setShow] = useState(true);
      return (
        <RealtimeProvider>
          {show ? <Probe room="season:s1" /> : null}
          <button type="button" onClick={() => setShow(false)}>
            hide
          </button>
        </RealtimeProvider>
      );
    }
    render(<Solo />);
    await waitFor(() => expect(sock.joins()).toContain("season:s1"));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "hide" }));
    await act(async () => {});
    expect(sock.leaves()).toContain("season:s1");
  });

  it("reference-counts co-mounted hooks so the second hook reuses the join", async () => {
    function Pair() {
      const [showA, setShowA] = useState(true);
      const [showB, setShowB] = useState(false);
      return (
        <RealtimeProvider>
          {showA ? <Probe room="chat" /> : null}
          {showB ? <Probe room="chat" /> : null}
          <button type="button" onClick={() => setShowB(true)}>
            add
          </button>
          <button type="button" onClick={() => setShowB(false)}>
            remove
          </button>
          <button type="button" onClick={() => setShowA(false)}>
            close
          </button>
        </RealtimeProvider>
      );
    }
    render(<Pair />);
    await waitFor(() => expect(sock.joins()).toContain("chat"));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    await waitFor(() => expect(screen.getAllByTestId("connected")).toHaveLength(2));
    expect(sock.joins().filter((r) => r === "chat")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    await waitFor(() => expect(screen.getAllByTestId("connected")).toHaveLength(1));
    expect(sock.leaves()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    await act(async () => {});
    expect(sock.leaves().filter((r) => r === "chat")).toHaveLength(1);
  });

  it("surfaces a denied join acknowledgement to the caller", async () => {
    sock.setAckOk(false);
    mount(null);
    fireEvent.click(screen.getByRole("button", { name: "join" }));
    await waitFor(() => expect(screen.getByTestId("ack").textContent).toBe("DENIED"));
  });

  it("resolves a direct join as ok when the server accepts", async () => {
    mount(null);
    fireEvent.click(screen.getByRole("button", { name: "join" }));
    await waitFor(() => expect(screen.getByTestId("ack").textContent).toBe("ok"));
    expect(sock.joins()).toContain("manual");
  });

  it("disconnects the socket on unmount", () => {
    const view = mount();
    view.unmount();
    expect(sock.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("emits one join for two hooks mounted on the same room in one commit", () => {
    sock.setDefer(true);
    render(
      <RealtimeProvider>
        <Probe room="season:s1" />
        <Probe room="season:s1" />
      </RealtimeProvider>,
    );
    expect(sock.joins().filter((r) => r === "season:s1")).toHaveLength(1);
  });

  it("leaves the room again when the ack lands after the last holder unmounted", async () => {
    function Mounted() {
      const [show, setShow] = useState(true);
      return (
        <RealtimeProvider>
          {show ? <Probe room="season:s1" /> : null}
          <button type="button" onClick={() => setShow(false)}>
            hide
          </button>
        </RealtimeProvider>
      );
    }
    sock.setDefer(true);
    render(<Mounted />);
    expect(sock.joins()).toContain("season:s1");

    fireEvent.click(screen.getByRole("button", { name: "hide" }));
    await act(async () => {
      sock.flushAcks();
    });

    // The socket is still connected; a join that is never compensated would
    // leak server-side membership for the rest of the session.
    expect(sock.leaves()).toContain("season:s1");
  });
});
