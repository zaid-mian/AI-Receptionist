import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liveHub, LiveEvent } from "../services/liveHub.js";

describe("Live Hub PubSub Service", () => {
  it("broadcasts live events to active listeners with timestamp", async () => {
    let received: LiveEvent | null = null;

    const listener = (ev: LiveEvent) => {
      received = ev;
    };

    liveHub.on("live_event", listener);

    liveHub.broadcast("takeover", {
      conversation_id: "conv_test_live_001",
      operator: "Dr. Fatima",
      taken_over: true,
    });

    assert.ok(received !== null, "Listener must receive broadcast event");
    const ev = received as unknown as LiveEvent;
    assert.equal(ev.type, "takeover");
    assert.equal(ev.data.conversation_id, "conv_test_live_001");
    assert.equal(ev.data.operator, "Dr. Fatima");
    assert.ok(ev.timestamp && !isNaN(Date.parse(ev.timestamp)), "Must have valid ISO timestamp");

    // Clean up
    liveHub.off("live_event", listener);
  });

  it("does not send events to detached listeners", () => {
    let count = 0;
    const listener = () => {
      count++;
    };

    liveHub.on("live_event", listener);
    liveHub.broadcast("message", { text: "hello 1" });
    assert.equal(count, 1);

    liveHub.off("live_event", listener);
    liveHub.broadcast("message", { text: "hello 2" });
    assert.equal(count, 1, "Unsubscribed listener should not receive further events");
  });
});
