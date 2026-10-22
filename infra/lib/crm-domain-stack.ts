// T010: Route53/ACM/custom domain for crm.aldarraj.com, not yet pointed live — cut over only
// after this story merges to feature/roofing-crm (Round 1 decision D-2). The Amplify default
// domain serves RUNTIME_URL in the meantime (CrmWebStack's AmplifyDefaultDomain output).
//
// While `cutover` is false (B-01), this stack declares no resources at all: a hosted-zone lookup
// and an ACM DNS-validated certificate both need a live AWS context lookup at synth time, which
// has no value yet (nothing points at the domain to validate), and would make `cdk synth
// --strict` (TN02) depend on network access for a domain this story deliberately does not wire
// live. The zone lookup, certificate and A/ALIAS record are added together once D-2 fires.
import { Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface CrmDomainStackProps extends StackProps {
  readonly domainName: string;
  /** False until the Round 1 D-2 cutover decision is executed; true wires the full domain stack. */
  readonly cutover: boolean;
}

export class CrmDomainStack extends Stack {
  constructor(scope: Construct, id: string, props: CrmDomainStackProps) {
    super(scope, id, props);

    if (!props.cutover) {
      return; // Not yet pointed live (Round 1 decision D-2) — see module header.
    }

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: props.domainName.split(".").slice(-2).join("."),
    });

    new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // The cutover's A/ALIAS record to CrmWeb's Amplify branch is added here once D-2 fires.
  }
}
