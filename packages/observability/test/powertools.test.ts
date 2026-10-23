import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METRIC_NAMES, withObservability } from "../src/index.js";

describe("withObservability", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Powertools Logger writes JSON lines through its own internal Console bound to
    // process.stdout (not the global `console`) outside POWERTOOLS_DEV mode — this is the real,
    // production code path, so the test observes stdout directly rather than toggling dev mode.
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("emits a structured JSON log entry naming the service", async () => {
    const wrapped = withObservability("test-handler", async () => "ok");
    await wrapped({});

    expect(stdoutSpy).toHaveBeenCalled();
    const loggedLine = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((line: string) => line.includes("handler invoked"));
    expect(loggedLine).toBeDefined();
    const parsed = JSON.parse(loggedLine as string);
    expect(parsed.service).toBe("test-handler");
    expect(typeof parsed.message).toBe("string");
  });

  it("opens an X-Ray subsegment around the handler call", async () => {
    let segmentOpenDuringCall = false;
    const wrapped = withObservability("test-handler", async (_event, obs) => {
      segmentOpenDuringCall = obs.tracer.getSegment() !== undefined;
      return "ok";
    });
    await wrapped({});
    expect(segmentOpenDuringCall).toBe(true);
  });

  it("lets the handler record a named custom metric without throwing", async () => {
    const wrapped = withObservability("test-handler", async (_event, obs) => {
      obs.metrics.addMetric(METRIC_NAMES.SyncDurationMs, "Milliseconds", 1234);
      return "ok";
    });
    await expect(wrapped({})).resolves.toBe("ok");
  });

  it("exposes the three named metric constants this story's handlers emit", () => {
    expect(METRIC_NAMES.SyncDurationMs).toBe("SyncDurationMs");
    expect(METRIC_NAMES.IndexColdLoadMs).toBe("IndexColdLoadMs");
    expect(METRIC_NAMES.IndexManifestAgeHours).toBe("IndexManifestAgeHours");
  });
});
