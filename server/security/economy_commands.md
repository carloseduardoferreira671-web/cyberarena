# Server-authoritative economy contract

Every economic or progression mutation from a connected account must use `POST /api/game/command` with a fresh `Idempotency-Key`.

## Supported commands

- `claim_free_offer`
- `claim_gem_offer`
- `buy_offer`
- `buy_gem_bundle`
- `open_box`
- `buy_premium`
- `claim_pass_reward`
- `claim_premium_reward`
- `claim_account_reward`
- `claim_mission`
- `change_name`
- `claim_inbox_reward`
- `mark_character_created`
- `mark_first_match`

## Invariants

- The server calculates prices, rewards, XP, inventory changes and box rolls.
- Box rolls use Node's cryptographic random generator, not browser `Math.random()`.
- An account row is locked with `FOR UPDATE` while a command is evaluated and committed.
- Reusing an idempotency key with a different operation or payload is rejected.
- A successful command writes an economy-ledger entry and an audit event in the same transaction.
- The browser receives the resulting authoritative state and version after the transaction commits.
- Inbox rewards are removed one at a time by message ID and reward index; the reward definition comes from the server-side inbox state.
- Daily box limits are evaluated against UTC date keys on the server.
- Mini Boxes: the first 5 openings per UTC day are free; after those 5, additional Mini Boxes cost 85 coins. Inventory boxes do not consume the daily free count.
- Cyber Boxes: maximum 5 shop openings per UTC day at 15 gems each.
- Mecha Boxes: maximum 5 shop openings per UTC day at 40 gems each.
