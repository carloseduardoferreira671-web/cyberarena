Create these files locally or through your deployment secret manager; never commit them:
- db_password.txt
- owner_bootstrap_secret.txt

Each should contain one high-entropy random secret and a trailing newline is acceptable.
