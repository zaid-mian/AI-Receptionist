import { EventEmitter } from "node:events";

export interface LiveEvent {
  type: "conversation_update" | "message" | "takeover" | "escalation";
  data: Record<string, unknown>;
  timestamp: string;
}

class LiveHub extends EventEmitter {
  broadcast(type: LiveEvent["type"], data: Record<string, unknown>): void {
    const event: LiveEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emit("live_event", event);
  }
}

export const liveHub = new LiveHub();
