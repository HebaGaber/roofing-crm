// Shared Powertools middleware (constitution Article VIII): every new Lambda handler in this
// story (apps/sync, apps/api's LeadIndex port) wraps with `withObservability` so JSON logging,
// X-Ray tracing and named custom metrics are never hand-rolled per handler. Metric names are
// constants here, never inline string literals at a call site (tasks.md T011).
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";

export const METRICS_NAMESPACE = "RoofingCrm";

export const METRIC_NAMES = {
  SyncDurationMs: "SyncDurationMs",
  IndexColdLoadMs: "IndexColdLoadMs",
  IndexManifestAgeHours: "IndexManifestAgeHours",
} as const;
export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

export interface Observability {
  readonly logger: Logger;
  readonly tracer: Tracer;
  readonly metrics: Metrics;
}

export function createObservability(serviceName: string): Observability {
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ namespace: METRICS_NAMESPACE, serviceName }),
  };
}

/**
 * Wraps a Lambda handler with the shared Logger/Tracer/Metrics middleware. The handler receives
 * the Observability instance instead of reaching for its own Logger/Tracer/Metrics, so every
 * handler emits the same structured JSON logs, the same X-Ray subsegment shape, and only the
 * named metric constants above.
 */
export function withObservability<TEvent, TResult>(
  serviceName: string,
  handler: (event: TEvent, obs: Observability) => Promise<TResult>,
) {
  const obs = createObservability(serviceName);
  return async (event: TEvent): Promise<TResult> => {
    obs.logger.info("handler invoked", { serviceName });
    const segment = obs.tracer.getSegment();
    const subsegment = segment?.addNewSubsegment(`## ${serviceName}`);
    if (subsegment) {
      obs.tracer.setSegment(subsegment);
    }
    try {
      const result = await handler(event, obs);
      obs.logger.info("handler completed", { serviceName });
      return result;
    } catch (error) {
      obs.logger.error("handler failed", { serviceName, error });
      throw error;
    } finally {
      obs.metrics.publishStoredMetrics();
      if (subsegment) {
        subsegment.close();
        if (segment) {
          obs.tracer.setSegment(segment);
        }
      }
    }
  };
}
