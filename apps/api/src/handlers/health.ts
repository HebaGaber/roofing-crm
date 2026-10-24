// T008: the Lambda entry point behind API Gateway HTTP API's Lambda proxy integration
// (infra/lib/crm-api-stack.ts), using tRPC's AWS Lambda adapter (build-frontend-backends §
// Phase 2). Public — no Cognito JWT authorizer attached to this route (contracts/health.md) — and
// Powertools-wrapped (constitution Article VIII, ARD-B §12.13: "every Lambda, not only health.ts"
// — this file is still the one every other Lambda in this story copies the wiring from).
import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { appRouter } from "../routers/index.js";
import { tryLeadIndex } from "../leadIndex.js";
import { tryLeadService } from "../leadService.js";
import type { TrpcContext } from "../trpc.js";

const logger = new Logger({ serviceName: "crm-api" });
const tracer = new Tracer({ serviceName: "crm-api" });
const metrics = new Metrics({ namespace: "RoofingCrm", serviceName: "crm-api" });

const trpcHandler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: ({ event }): TrpcContext => {
    const base: TrpcContext = { requestId: event.requestContext.requestId };
    // B-03: wired lazily, never thrown here — a missing CRM_INDEX_BUCKET_NAME/CRM_LEADS_TABLE_NAME
    // (the known infra gap, apps/api/src/leadIndex.ts) must not break health.ping or auth routes.
    // The key is omitted entirely (not set to `undefined`) when there is no index yet —
    // `exactOptionalPropertyTypes` treats "optional, absent" and "present, undefined" as
    // different things, and TrpcContext's `leadIndex` is the former; a spread of a ternary loses
    // that distinction (it infers `leadIndex?: LeadIndex | undefined`), so this branches instead.
    const leadIndex = tryLeadIndex();
    // B-07: the lead service (LeadRepo injected inside tryLeadService) and the caller's Cognito
    // `sub` from the HTTP API JWT authorizer. Same absent-not-undefined rule as `leadIndex`.
    const leadService = tryLeadService();
    const sub = (
      event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
    ).authorizer?.jwt?.claims?.sub;
    return {
      ...base,
      ...(leadIndex === undefined ? {} : { leadIndex }),
      ...(leadService === undefined ? {} : { leadService }),
      ...(typeof sub === "string" ? { userId: sub } : {}),
    };
  },
});

// The tRPC Lambda adapter derives the procedure path from the route match: for a route with a
// greedy `{proxy+}` path parameter it uses the matched remainder (correct), but for an exact
// literal route (our public, unauthorized health.ping route — found deploying) it falls back to
// the full `rawPath`, which still has the API Gateway route's own "/trpc" prefix attached
// ("No procedure found on path \"trpc/health.ping\""). Strip it before handing the event over.
export function stripTrpcPrefix(event: APIGatewayProxyEventV2): APIGatewayProxyEventV2 {
  const prefix = "/trpc";
  if (!event.rawPath.startsWith(`${prefix}/`)) return event;
  return { ...event, rawPath: event.rawPath.slice(prefix.length) };
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<ReturnType<typeof trpcHandler>> {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment("## crm-api.health");
  logger.addContext(context);
  logger.info("health.ping invoked", { requestId: event.requestContext.requestId });
  try {
    const result = await trpcHandler(stripTrpcPrefix(event), context);
    metrics.addMetric("HealthPingInvocations", MetricUnit.Count, 1);
    return result;
  } catch (error) {
    metrics.addMetric("HealthPingErrors", MetricUnit.Count, 1);
    logger.error("health.ping failed", { error });
    throw error;
  } finally {
    subsegment?.close();
    metrics.publishStoredMetrics();
  }
}
