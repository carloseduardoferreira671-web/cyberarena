# Security Architecture

```text
Untrusted Browser
   |
   | HTTPS + secure session cookie
   v
Reverse Proxy / WAF
   |
   v
CyberArena API
   |-- validation / authorization
   |-- rate limiting
   |-- idempotency
   |-- transaction boundaries
   |-- audit/security events
   v
PostgreSQL
   |-- constraints
   |-- authoritative state
   |-- economy ledger
   |-- sessions
   |-- code redemption
   |
   +--> encrypted/versioned off-host backups
```

The browser is a presentation layer. It must not be trusted for balances, reward values, timers, ownership, ban status, or code rewards.

## v79 anti-cheat boundary
The generic state endpoint is deliberately **not** an economy API. Protected identity/economy/progression fields must match the server copy. Future gameplay actions must use explicit server commands that calculate their own results.
