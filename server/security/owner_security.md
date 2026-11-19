# Owner Security

The owner account has the highest privilege and must be protected separately from ordinary player accounts.

## Current server controls

- `is_owner` is checked server-side.
- The owner target cannot be banned through the normal ban endpoint.
- Owner administrative actions are audited.
- Ordinary session authentication is required before owner routes.
- A second, short-lived admin session is required before owner routes.
- Failed owner step-up attempts are recorded as security events.
- Owner sessions can be revoked by logout/maintenance.
- The browser's local owner key is not used as the security boundary when the backend is available.

## Required before public administration

- Add a phishing-resistant second factor such as WebAuthn/passkeys or an equivalent managed MFA control.
- Consider network/IP allowlisting for the owner panel.
- Alert on repeated owner authentication failures, ban activity and unusual economy events.
