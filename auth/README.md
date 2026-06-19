# MangaDex Auth Proxy

Cloudflare Worker CORS proxy for MangaDex OAuth/API setup flows.

This exists for plain HTML tools that need to call MangaDex OAuth from a browser. Browsers block direct cross-origin token responses, so this worker forwards the request and adds CORS headers to the response.

## Deploy

```bash
npm install
npm run deploy
```

## Local Development

```bash
npm install
npm run dev
```

## Usage

```text
https://your-worker.example/https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```

Example with placeholder values:

```bash
curl "https://your-worker.example/https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

## Allowed Targets

This worker only proxies:

- `https://auth.mangadex.org/*`
- `https://api.mangadex.org/*`

It rejects other hosts so the deployed worker is not a fully open public proxy.

## Security

The worker can read whatever you send through it. That includes usernames, passwords, client secrets, access tokens, and refresh tokens.

Deploy your own worker and use it only for setup/testing. For scheduled GitHub Actions, store tokens in GitHub Secrets and call MangaDex directly from the action.
