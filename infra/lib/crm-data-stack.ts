// T038: the private S3 bucket (`crm-index`) that holds this story's sync output — content-
// addressed raw parts under `raw/{manifestCid}/` (FetchPart, apps/sync/handlers/fetchPart.ts) and
// the built `crm_property`/`crm_permit` Parquet under `index/{manifestCid}/` (BuildIndex). Block
// Public Access, SSE, `enforceSSL` (constitution P0-8, architecture-constitution.md §10 Security
// row). No longer "intentionally empty" (B-01 T005) — infra/test/crm-data-stack.test.ts (T009).
import { RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

export class CrmDataStack extends Stack {
  public readonly indexBucket: s3.Bucket;
  public readonly leadsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.indexBucket = new s3.Bucket(this, "IndexBucket", {
      bucketName: "crm-index",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Demo project (constitution Article III addendum): every run gets its own
      // index/{manifestCid}/ folder (architecture-constitution.md §11), so there is no durable
      // business data this bucket alone is the only copy of — Task A's published CIDs are the
      // source of truth and can always be re-synced.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // B-07 T002: `crm-leads` skeleton (key schema only). GSI1/GSI2 and grants are added by T012.
    this.leadsTable = new dynamodb.Table(this, "LeadsTable", {
      tableName: "crm-leads",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY, // Demo project (Article III addendum).
    });
    Tags.of(this.leadsTable).add("project_name", "roofing-crm");

    NagSuppressions.addResourceSuppressions(this.indexBucket, [
      {
        id: "AwsSolutions-S1",
        reason:
          "Server access logging would add another bucket and cost with no benefit for this time-boxed, $120-credit demo account (constitution Article III addendum); every write already goes through CloudTrail data events if that audit trail is ever needed.",
      },
    ]);
  }
}
