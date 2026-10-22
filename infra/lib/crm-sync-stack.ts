// T005: declared empty/stubbed per research.md — the Step Functions sync pipeline
// (architecture-constitution.md §9's `apps/sync`) is not built before B-02+. No resources yet.
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export class CrmSyncStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // Intentionally empty — see module header.
  }
}
