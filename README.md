# MangaDex Image/Auth Proxy

Two small proxies for projects that need MangaDex data in a browser, README renderer, or hosted automation.

- `image/` is an Express image proxy for MangaDex covers. It is meant for Hugging Face Spaces and other Docker hosts.
- `image/cloudflare-worker/` is the same cover proxy as a Cloudflare Worker.
- `auth/` is a Cloudflare Worker CORS proxy for MangaDex OAuth/API setup flows.

The root `Dockerfile` runs the image proxy, so this repository can be used directly as a Docker Hugging Face Space.

## Why This Exists

MangaDex does not add CORS headers for third-party websites. If a browser app calls MangaDex directly, the browser may block the response even when MangaDex returned data correctly.

Cover images can also behave differently inside markdown previews because the preview site sends its own `Referer` and image request headers. The image proxy requests MangaDex covers with browser-like headers and then serves the image from your own domain with permissive cross-origin headers.

Use a proxy you control for auth. The auth proxy sees the request body while generating tokens.

## Project Layout

```text
mangadex-image-auth-proxy/
├─ Dockerfile
├─ README.md
├─ auth/
│  ├─ README.md
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ worker.ts
│  └─ wrangler.toml
└─ image/
   ├─ Dockerfile
   ├─ README.md
   ├─ cloudflare-worker/
   ├─ package-lock.json
   ├─ package.json
   └─ server.js
```

## Deploy Image Proxy On Hugging Face

1. Create a new Hugging Face Space.
2. Select `Docker` as the Space SDK.
3. Upload or push this repository.
4. Hugging Face builds the root `Dockerfile`.
5. The image proxy listens on port `7860`.

Example proxy URL after deployment:

```text
https://your-space.hf.space/covers/<manga-id>/<cover-file>.256.jpg
```

The proxy fetches:

```text
https://uploads.mangadex.org/covers/<manga-id>/<cover-file>.256.jpg
```

For `MAL-ReadmeList` / `mangadex-readlist`, use:

```yaml
cover_proxy_url: "https://your-space.hf.space${path}"
```

## Deploy Image Proxy On Cloudflare

If you prefer a Worker instead of Hugging Face:

```bash
cd image/cloudflare-worker
npm install
npm run deploy
```

Then use:

```yaml
cover_proxy_url: "https://your-worker.example${path}"
```

If your image format already uses `https://mangadex.org/covers/...`, the proxy still accepts the full URL and strips the MangaDex domain before fetching from `uploads.mangadex.org`.

## Image Proxy Local Test

```bash
cd image
npm install
npm start
```

Open:

```text
http://localhost:7860/covers/<manga-id>/<cover-file>.256.jpg
```

You can also pass a full URL through `url`:

```text
http://localhost:7860/?url=https://uploads.mangadex.org/covers/<manga-id>/<cover-file>.256.jpg
```

## Deploy Auth Proxy On Cloudflare

The auth proxy is a Cloudflare Worker. It is mainly useful for a plain HTML setup wizard that needs to call MangaDex OAuth from the browser.

```bash
cd auth
npm install
npm run deploy
```

Example usage:

```text
https://your-worker.example/https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```

For a setup wizard CORS proxy value:

```text
https://your-worker.example/
```

The worker preserves `application/x-www-form-urlencoded` request bodies, which is required for MangaDex OAuth token requests.

## Auth Proxy Local Test

```bash
cd auth
npm install
npm run dev
```

Then send a token request through the local Worker URL using placeholder values:

```bash
curl "http://localhost:8787/https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

Do not commit real credentials, refresh tokens, or `.dev.vars`.

## Security Notes

- The auth proxy can see usernames, passwords, client secrets, access tokens, and refresh tokens if you send them through it.
- Deploy your own auth proxy. Do not send MangaDex credentials through a random public CORS proxy.
- The image proxy is lower risk because it only requests public image paths, but it is still a public endpoint.
- Keep the image proxy path-based if possible: `https://your-space.hf.space${path}`.
- Keep the auth proxy limited to setup/testing. GitHub Actions should use stored secrets directly, not the browser proxy.

## Recommended ReadmeList Settings

For cover images:

```yaml
cover_url_format: "https://uploads.mangadex.org/covers/${mangaId}/${coverFileName}.256.jpg"
cover_proxy_url: "https://your-space.hf.space${path}"
```

For a browser setup wizard:

```text
https://your-auth-worker.example/
```

## Publish To GitHub

From this folder:

```bash
git init
git add .
git commit -m "Initial MangaDex auth and image proxies"
git branch -M main
git remote add origin https://github.com/gamersindo1223/mangadex-image-auth-proxy.git
git push -u origin main
```

Create the GitHub repository first if it does not exist yet.

## Push To Hugging Face

Use a Hugging Face token as a temporary environment variable. Replace `YOUR_TOKEN` with your real token when running the command.

```powershell
$env:HF_TOKEN = "YOUR_TOKEN"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("__token__:$env:HF_TOKEN"))
git -c credential.helper= -c "http.https://huggingface.co/.extraheader=Authorization: Basic $basic" push https://huggingface.co/spaces/Apsiknb/image main
Remove-Item Env:HF_TOKEN
```
