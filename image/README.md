# MangaDex Image Proxy

Express proxy for MangaDex cover images.

It accepts a MangaDex cover path:

```text
https://your-domain.example/covers/<manga-id>/<cover-file>.256.jpg
```

Then fetches:

```text
https://uploads.mangadex.org/covers/<manga-id>/<cover-file>.256.jpg
```

The upstream request includes a MangaDex referer and browser-like image headers. The response adds cross-origin headers so markdown previews and browser tools can load the proxied image from your own domain.

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:7860/covers/<manga-id>/<cover-file>.256.jpg
```

## Deploy To Hugging Face

If this folder is deployed by itself, use this folder's `Dockerfile`.

If you deploy the full repository, use the root `Dockerfile`; it points to this image proxy automatically.

## Cloudflare Worker Option

The `cloudflare-worker/` folder contains the same image proxy as a Worker project.

```bash
cd cloudflare-worker
npm install
npm run deploy
```

## ReadmeList Setting

```yaml
cover_proxy_url: "https://your-space.hf.space${path}"
```
