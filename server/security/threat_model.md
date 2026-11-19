# CyberArena — Threat Model (v79)

## Assets
- Cyber Account credentials and sessions
- Owner/admin privileges
- Coins, gems, Cyber Fichas, XP, Pass and inventory
- Community codes and their reward definitions
- Inbox rewards
- Ban state and audit history

## Primary threats
1. Client tampering: edited JS/HTML, DevTools, modified localStorage.
2. Replay: repeating a claim/purchase/redeem request.
3. Race conditions: two tabs/devices claiming the same reward simultaneously.
4. Credential attacks: password guessing, credential stuffing, session theft.
5. CSRF/cross-origin requests against authenticated cookies.
6. Privilege escalation into owner routes.
7. Database exposure or excessive DB privileges.
8. Backup theft or untested restoration.
9. Supply-chain compromise through dependencies.
10. Abuse of public endpoints (registration/login/code redemption).

## Trust boundaries
- Browser is untrusted.
- Public API is hostile-input territory.
- Backend is trusted application logic.
- PostgreSQL is trusted data storage, but credentials must have least privilege.
- Backups are sensitive copies of production data.

## Required controls
- Server-authoritative economy.
- Transactional writes for grants/consumption.
- Idempotency keys for every economic mutation.
- Unique database constraints for one-time actions.
- Session tokens stored only as hashes.
- Password hashing with scrypt/Argon2id.
- Secure, HttpOnly, SameSite cookies; Secure + __Host- prefix in HTTPS production.
- Strict Origin checking for unsafe API methods when PUBLIC_ORIGIN is configured.
- Rate limits with a distributed store in multi-instance production.
- Owner step-up authentication with MFA/WebAuthn before high-risk administration.
- Immutable/append-oriented audit events with restricted access.
- DB not exposed to the public Internet.
- Encrypted, versioned, off-host backups and tested restores.

## Residual risk
A copied local ZIP cannot provide global security. Global enforcement exists only when players use the hosted backend and the backend remains authoritative.
