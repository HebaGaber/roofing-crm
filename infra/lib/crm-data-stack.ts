// T005: declared empty/stubbed per research.md ("CrmData/CrmSync stay stubbed; the one new table
// this story needs lives in CrmOps") — B-02+ populates this with the lead/property index
// (architecture-constitution.md §9's module-boundary table). No resources yet.
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export class CrmDataStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // Intentionally empty — see module header.
  }
}
