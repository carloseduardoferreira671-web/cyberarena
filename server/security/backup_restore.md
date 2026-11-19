# Backup and Restore Policy

Backups are security-sensitive copies of player data.

## Minimum policy
- Daily PostgreSQL custom-format dump.
- At least one copy stored outside the database host/volume.
- Encryption at rest and in transit.
- Versioning/retention to resist accidental deletion.
- Regular restore drills into an isolated database.
- Record the last successful restore test date.

The local Docker backup volume is not sufficient as the only production backup. It is a convenience copy; production needs off-host storage.
