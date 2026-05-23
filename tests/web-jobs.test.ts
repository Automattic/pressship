import { describe, expect, it } from "vitest";
import { WebJobManager } from "../src/web/jobs.js";

describe("studio jobs", () => {
  it("replays job events to subscribers and stores final status", async () => {
    const jobs = new WebJobManager();
    const snapshot = jobs.create("test", "Test job", (context) => {
      context.status("Working");
      context.log("Almost done");
      return { ok: true };
    });

    await waitFor(() => jobs.get(snapshot.id)?.status === "succeeded");

    const replayed = await new Promise<string[]>((resolve) => {
      const types: string[] = [];
      jobs.subscribe(
        snapshot.id,
        (event) => types.push(event.type),
        () => resolve(types)
      );
    });

    expect(replayed).toEqual(["status", "status", "log", "result", "done"]);
    expect(jobs.get(snapshot.id)).toMatchObject({ status: "succeeded" });
  });

  it("cancels running jobs", async () => {
    const jobs = new WebJobManager();
    const snapshot = jobs.create(
      "test",
      "Long job",
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    expect(jobs.cancel(snapshot.id)).toBe(true);
    await waitFor(() => jobs.get(snapshot.id)?.status === "cancelled");
    expect(jobs.get(snapshot.id)).toMatchObject({ status: "cancelled" });
  });
});

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
