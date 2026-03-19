# Agency Starter

## Run

1. `npm start`
2. Open `http://localhost:8000`

## Security notes

This project now includes a stronger first-pass security baseline for local and early hosted use:

- staff-only routes are protected behind authenticated sessions
- staff login attempts are rate limited
- public lead submissions are rate limited
- lead form input is validated and trimmed before saving
- request bodies are size limited
- staff action posts reject cross-origin requests
- session cookies use `HttpOnly` and strict same-site settings

Before deploying, set a hashed staff password instead of a plain one:

1. Run `npm run hash-password -- "your-strong-password"`
2. Copy the printed value into `STAFF_PASSWORD_HASH`
3. Set `STAFF_EMAIL` to the team email allowed to sign in, or `STAFF_EMAILS` for a comma-separated list
4. Start the server with those env vars set

If `STAFF_PASSWORD_HASH` is not set, the app falls back to `STAFF_PASSWORD`. Do not use the default fallback password in production.

## Email notifications

This project can send email notifications for:

- new lead submissions
- accepted meeting times

If SMTP credentials are not configured yet, the app does not fail. Instead, it saves email drafts to:

- `data/email-outbox/`

To enable Gmail sending later, copy `.env.example` values into your shell environment and use a Gmail app password for `SMTP_PASS`.

## Staff login

Staff pages are protected behind a staff email plus password session.

- public pages: client portal, services, project intake
- protected pages: staff portal, leads, lead detail, email preview, proposal preview, internal workflow

Recommended:

- set `STAFF_EMAIL`
- or set `STAFF_EMAILS` for multiple staff inboxes
- set `STAFF_PASSWORD_HASH`

Fallback for local-only testing:

- set `STAFF_PASSWORD`

If you do not set either value, the app uses:

- `changeme123`
