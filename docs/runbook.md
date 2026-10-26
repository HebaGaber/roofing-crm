# Runbook: data sync, rollback and replay

Everything here runs from the PO's laptop with the `assess` profile (account 515618610572, `eu-north-1`). CI never deploys.

## Which data is served

`META#index` in the `crm-leads` DynamoDB table holds `current` (the served manifest CID) and `previous`. The API loads `index/{current}/crm_property.parquet` and `crm_permit.parquet` from the `crm-index` bucket.

## Move to a new Task A run

1. Set the GitHub variable `DATA_MANIFEST_CID` to the new manifest CID (`gh variable set DATA_MANIFEST_CID -R HebaGaber/roofing-crm --body <cid>`).
2. Deploy from a clean worktree: `cdk deploy --all` in `infra/` with `DATA_MANIFEST_CID`, `AI_PROVIDER`, `AGENT_MODEL_ID` set. The deploy starts one `crm-sync` execution named `{cid}-{nonce}`.
3. Watch the execution in Step Functions. Plan fetches and verifies every part by CID and SHA-256, BuildIndex writes the Parquet index, Validate checks it, Promote flips the pointer only when all checks pass.

## Roll back to the previous run

The previous index files stay in S3 under `index/{previous}/`, so a rollback does not need to rebuild.

1. Read `previous` from `META#index`.
2. Set `DATA_MANIFEST_CID` to that CID and deploy as above. Plan finds no promoted copy of it as `current`, rebuilds (or, with `forceRebuild`, rebuilds again), validates and promotes it. Allow about 3 minutes plus the deploy.
3. Bump `INDEX_SCHEMA_VERSION` in `infra/lib/crm-api-stack.ts` when index code changed, so warm API sandboxes reload.

## Rebuild the served run after a code change

Start an execution of `crm-sync` with input `{"manifestCidHint": "<current cid>", "forceRebuild": true}`. The pointer stays; the Parquet files are rewritten. Then bump `INDEX_SCHEMA_VERSION` and redeploy `CrmApi`.

## Alarms (the sync alarm topic, emailed to the configured alarm address)

| Alarm | Meaning | What to do |
| --- | --- | --- |
| `crm-sync-fetch-part-dlq-depth` | A part could not be fetched or verified | Read the DLQ messages, fix or wait for the gateway, start a new execution. The run was held; the old index serves. |
| `crm-sync-execution-failed` / `-timed-out` / `-aborted` | A step crashed (for example BuildIndex out of memory) | Open the execution, read the failing step's error, fix, start a new execution. The old index serves. |
| `crm-sync-held-no-promotion` | Plan or Validate held the run (cost gate, profile digest, lineage fork, unverified part, unexplained diff) | The execution succeeded but did not promote. Read the `HeldNoPromotion` state input for the reason. |

## Replaying the FetchPart DLQ

Messages in `crm-sync-fetch-part-dlq` are `{manifestCid, part}`. They are not redriven automatically; a new `crm-sync` execution for the same CID refetches every part (already stored parts are skipped by their content-addressed key). Purge the queue after the new run promotes so the alarm returns to OK.

## BuildIndex memory

BuildIndex runs DuckDB at `memory_limit` 2600 MB inside a 3008 MB Lambda (the account cannot raise Lambda memory above 3008 MB). Run 3.1 builds in 51 to 88 seconds. If a later run grows past the limit the execution fails and `crm-sync-execution-failed` fires; the next step is Fargate for BuildIndex (architecture constitution section 10).

## Demo-project data policy

The leads table and the index bucket use `RemovalPolicy.DESTROY` so the demo stack can be torn down. Deleting the CrmData stack deletes the leads.
