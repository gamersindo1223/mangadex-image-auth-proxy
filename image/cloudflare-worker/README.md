# MangaDex Image Worker

Cloudflare Worker version of the MangaDex cover image proxy.

Use this if you want the image proxy on Cloudflare instead of Hugging Face.

## Deploy

```bash
npm install
npm run deploy
```

## URL Shape

```text
https://your-worker.example/covers/<manga-id>/<cover-file>.256.jpg
```

It fetches:

```text
https://uploads.mangadex.org/covers/<manga-id>/<cover-file>.256.jpg
```

## ReadmeList Setting

```yaml
cover_proxy_url: "https://your-worker.example${path}"
```
