# CyberArena Production Security Checklist

## Before first public launch
- [ ] Use a dedicated domain and HTTPS.
- [ ] `NODE_ENV=production`.
- [ ] `COOKIE_SECURE=true`.
- [ ] `PUBLIC_ORIGIN=https://...` exact origin.
- [ ] Use a unique random DB password and owner password.
- [ ] PostgreSQL private network only; never publish port 5432.
- [ ] App DB role has only required privileges; no superuser.
- [ ] Store secrets in the hosting provider's secret manager, not `.env` in the repository.
- [ ] Enable external, encrypted, versioned backups.
- [ ] Perform and document a restore test.
- [ ] Put a WAF/reverse proxy in front of the API where appropriate.
- [ ] Use a distributed rate-limit store if running multiple app instances.
- [ ] Enable monitoring/alerts for repeated authentication failures, 5xx spikes, ban activity and unusual economy mutations.
- [ ] Enable MFA/WebAuthn for the owner before opening the admin panel to the Internet.
- [ ] Pin/lock dependency versions and review security advisories before releases.
- [ ] Never expose database credentials, session tokens, owner secrets or backup files in logs.

## Release process
- Run syntax checks and tests.
- Run DB migrations before enabling new endpoints.
- Review schema changes for privilege escalation and data-loss risks.
- Take a backup before destructive migrations.
- Verify health endpoint and authenticated smoke tests.
- Roll out gradually if possible.
- [ ] Run the owner bootstrap only from the trusted deployment/operator environment; never put the owner password in the long-running app container.
