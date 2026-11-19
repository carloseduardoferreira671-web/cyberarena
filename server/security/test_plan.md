# CyberArena security and integrity test plan

## Authentication

1. Register a new account with a valid password.
2. Confirm a session cookie is issued and the password is never returned.
3. Verify wrong-password and unknown-account responses do not reveal which account exists.
4. Verify banned accounts cannot authenticate.
5. Verify logout revokes the session.

## Economy integrity

1. Attempt to change coins, gems, Cyber Fichas, XP, inventory, Pass or progression through a generic state write; it must be rejected because no generic economy endpoint exists.
2. Repeat a command with the same idempotency key; the original result must be replayed without a second grant/charge.
3. Reuse the same idempotency key with a different payload; the request must be rejected.
4. Run simultaneous claims/purchases against the same account and confirm row locking prevents lost updates.
5. Open boxes repeatedly and verify all guaranteed and lucky rewards are calculated server-side.
6. Verify Mini free openings stop at 5 per UTC day and subsequent Mini openings charge 85 coins.
7. Verify Cyber and Mecha shop openings stop at 5 per UTC day.
8. Verify an inventory box can still be opened after the daily shop limit is reached.

## Inbox

1. Redeem `CYBERARENA001` once; the server creates one Inbox message.
2. Redeem the same code again on the same account; it must be rejected.
3. Claim Inbox rewards one at a time and verify only the claimed item is removed.
4. Verify the Inbox message disappears only after its final reward is claimed.

## Owner/admin

1. Verify non-owner accounts cannot enter admin routes.
2. Verify owner routes require a valid short-lived admin step-up session.
3. Verify failed owner re-authentication is logged.
4. Verify the owner account cannot be banned.
5. Verify banning another account revokes that account's active sessions.

## Deployment

1. Run the full project audit.
2. Apply migrations to an isolated database.
3. Run a backup and restore drill.
4. Verify PostgreSQL is not publicly exposed.
5. Verify HTTPS, secure `__Host-` cookies and exact Origin validation in production.
6. Run dependency/security-advisory review before each public release.
