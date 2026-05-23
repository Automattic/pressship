import { EventEmitter } from "node:events";

export type WebJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type WebJobEventType = "status" | "log" | "result" | "error" | "done";
export type WebJobEvent = {
  id: number;
  type: WebJobEventType;
  time: string;
  data: unknown;
};
export type WebJobSnapshot = {
  id: string;
  type: string;
  status: WebJobStatus;
  title: string;
  createdAt: string;
  updatedAt: string;
  events: WebJobEvent[];
};
export type WebJobContext = {
  signal: AbortSignal;
  log(message: string, data?: unknown): void;
  status(message: string): void;
  result(data: unknown): void;
  registerCancel(cancel: () => void): void;
};

export class WebJobManager {
  private readonly jobs = new Map<string, InternalWebJob>();

  create(type: string, title: string, run: (context: WebJobContext) => Promise<unknown> | unknown): WebJobSnapshot {
    const job = new InternalWebJob(type, title);
    this.jobs.set(job.snapshot.id, job);
    void job.start(run);
    return job.snapshot;
  }

  get(id: string): WebJobSnapshot | undefined {
    return this.jobs.get(id)?.snapshot;
  }

  list(): WebJobSnapshot[] {
    return Array.from(this.jobs.values()).map((job) => job.snapshot);
  }

  cancel(id: string): boolean {
    return this.jobs.get(id)?.cancel() ?? false;
  }

  subscribe(id: string, onEvent: (event: WebJobEvent) => void, onClose: () => void): () => void {
    const job = this.jobs.get(id);
    if (!job) {
      onClose();
      return () => undefined;
    }

    for (const event of job.snapshot.events) {
      onEvent(event);
    }

    if (!["queued", "running"].includes(job.snapshot.status)) {
      onClose();
      return () => undefined;
    }

    return job.subscribe(onEvent, onClose);
  }

  cancelRunningJobs(): void {
    for (const job of this.jobs.values()) {
      if (job.snapshot.status === "queued" || job.snapshot.status === "running") {
        job.cancel();
      }
    }
  }
}

class InternalWebJob {
  private readonly emitter = new EventEmitter();
  private readonly controller = new AbortController();
  private cancelCallbacks: Array<() => void> = [];
  private eventId = 0;
  readonly snapshot: WebJobSnapshot;

  constructor(type: string, title: string) {
    const now = new Date().toISOString();
    this.snapshot = {
      id: createJobId(),
      type,
      status: "queued",
      title,
      createdAt: now,
      updatedAt: now,
      events: []
    };
  }

  async start(run: (context: WebJobContext) => Promise<unknown> | unknown): Promise<void> {
    this.setStatus("running");
    this.emit("status", { message: "Job started." });

    try {
      const returned = await run({
        signal: this.controller.signal,
        log: (message, data) => this.emit("log", { message, data: redactSecrets(data) }),
        status: (message) => this.emit("status", { message }),
        result: (data) => this.emit("result", redactSecrets(data)),
        registerCancel: (cancel) => {
          this.cancelCallbacks.push(cancel);
        }
      });

      if (returned !== undefined) {
        this.emit("result", redactSecrets(returned));
      }

      if (this.snapshot.status === "cancelled") {
        this.emit("done", { status: "cancelled" });
        return;
      }

      this.setStatus("succeeded");
      this.emit("done", { status: "succeeded" });
    } catch (error) {
      if (this.snapshot.status === "cancelled" || this.controller.signal.aborted) {
        this.setStatus("cancelled");
        this.emit("done", { status: "cancelled" });
        return;
      }

      this.setStatus("failed");
      this.emit("error", { message: error instanceof Error ? error.message : String(error) });
      this.emit("done", { status: "failed" });
    }
  }

  cancel(): boolean {
    if (!["queued", "running"].includes(this.snapshot.status)) {
      return false;
    }

    this.controller.abort();
    for (const cancel of this.cancelCallbacks) {
      cancel();
    }
    this.cancelCallbacks = [];
    this.setStatus("cancelled");
    this.emit("status", { message: "Job cancelled." });
    this.emit("done", { status: "cancelled" });
    return true;
  }

  subscribe(onEvent: (event: WebJobEvent) => void, onClose: () => void): () => void {
    this.emitter.on("event", onEvent);
    this.emitter.once("close", onClose);
    return () => {
      this.emitter.off("event", onEvent);
      this.emitter.off("close", onClose);
    };
  }

  private setStatus(status: WebJobStatus): void {
    this.snapshot.status = status;
    this.snapshot.updatedAt = new Date().toISOString();
  }

  private emit(type: WebJobEventType, data: unknown): void {
    const event = {
      id: ++this.eventId,
      type,
      time: new Date().toISOString(),
      data
    };
    this.snapshot.events.push(event);
    this.snapshot.updatedAt = event.time;
    this.emitter.emit("event", event);
    if (type === "done") {
      this.emitter.emit("close");
    }
  }
}

function createJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/(--password\s+)(\S+)/g, "$1<redacted>")
      .replace(/("password"\s*:\s*")([^"]+)(")/g, "$1<redacted>$3");
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        /password|token|storage/i.test(key) ? "<redacted>" : redactSecrets(nested)
      ])
    );
  }

  return value;
}
