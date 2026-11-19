# CyberArena Incident Response

## If an owner credential is suspected compromised
1. Disable owner sessions immediately.
2. Rotate the owner password and all owner step-up credentials.
3. Rotate application secrets that may have been exposed.
4. Inspect audit/security events for admin and economy mutations.
5. Restore from a known-good backup only after identifying the incident window.
6. Revoke all sessions if session compromise is suspected.

## If economy duplication is detected
1. Freeze the affected operation endpoint.
2. Preserve audit logs and the relevant ledger records.
3. Identify the idempotency/request IDs involved.
4. Reconcile balances from the authoritative ledger.
5. Correct balances using an explicit, audited administrative transaction.
6. Do not edit player balances directly in ad-hoc SQL without an audit trail.

## If the database is exposed
Treat all credentials as compromised, rotate them, restrict network access, review access logs, and restore/validate from a clean environment.
