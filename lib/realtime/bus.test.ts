import { afterEach, describe, expect, it } from "vitest";

import { publish, setRealtimeTransport, subscribeRealtime, type RealtimeEnvelope } from "./bus";
import { CHAT_ROOM } from "./protocol";

describe("realtime bus", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const stop of cleanups.splice(0)) stop();
  });
  function onNext(handler: (envelope: RealtimeEnvelope) => void): void {
    cleanups.push(subscribeRealtime(handler));
  }

  it("delivers published envelopes to subscribers", () => {
    const seen: RealtimeEnvelope[] = [];
    onNext((e) => seen.push(e));
    publish(CHAT_ROOM, "chat:message", {
      id: "m1",
      userId: "u1",
      content: "hi",
      createdAt: new Date(0).toISOString(),
      username: "u",
      displayName: null,
      avatarUrl: null,
      role: "viewer",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ room: CHAT_ROOM, event: "chat:message" });
  });

  it("fans out to every subscriber and stops after unsubscribe", () => {
    let a = 0;
    let b = 0;
    const stopA = subscribeRealtime(() => {
      a += 1;
    });
    onNext(() => {
      b += 1;
    });
    publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null });
    expect([a, b]).toEqual([1, 1]);
    stopA();
    publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null });
    expect([a, b]).toEqual([1, 2]);
  });

  it("never throws, even when a subscriber blows up", () => {
    onNext(() => {
      throw new Error("boom");
    });
    expect(() =>
      publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null }),
    ).not.toThrow();
  });
});

describe("sequence numbers", () => {
  it("stamps every payload with a monotonic sequence", () => {
    const seen: RealtimeEnvelope[] = [];
    const stop = subscribeRealtime((e) => seen.push(e));
    try {
      publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null });
      publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null });
    } finally {
      stop();
    }
    expect(seen).toHaveLength(2);
    const first = seen[0]!.seq;
    const second = seen[1]!.seq;
    expect(second).toBe(first + 1);
    const firstPayload = seen[0]!.payload;
    const stamped =
      typeof firstPayload === "object" && firstPayload !== null && "seq" in firstPayload
        ? firstPayload.seq
        : undefined;
    expect(stamped).toBe(first);
  });

  it("fans out through a pluggable transport", () => {
    const seen: RealtimeEnvelope[] = [];
    setRealtimeTransport({
      emit: (e) => {
        seen.push(e);
      },
      on: () => () => undefined,
    });
    try {
      publish(CHAT_ROOM, "chat:typing", { userId: "u", username: "u", displayName: null });
    } finally {
      setRealtimeTransport(null);
    }
    expect(seen).toHaveLength(1);
  });
});
