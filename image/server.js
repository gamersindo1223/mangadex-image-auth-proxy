const express = require("express");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 7860;
const UPLOADS_ORIGIN = "https://uploads.mangadex.org";

app.get("/*", (req, res) => {
  let imagePath = req.params[0];

  if (!imagePath && req.query.url) {
    imagePath = String(req.query.url);
  }

  if (!imagePath) {
    return res.status(400).send("Image path required");
  }

  imagePath = normalizeImagePath(imagePath);

  if (!imagePath.startsWith("covers/")) {
    return res.status(400).send("Only MangaDex cover paths are supported");
  }

  const targetUrl = `${UPLOADS_ORIGIN}/${imagePath}`;
  const requestOptions = {
    headers: {
      Referer: "https://mangadex.org/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      DNT: "1",
    },
  };

  https
    .get(targetUrl, requestOptions, (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        proxyRes.resume();
        return res
          .status(proxyRes.statusCode || 502)
          .send(`Image not found or error from upstream: ${proxyRes.statusCode}`);
      }

      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "*");
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      res.set("Content-Type", proxyRes.headers["content-type"] || "application/octet-stream");
      res.set("Cache-Control", "public, max-age=31536000, immutable");

      proxyRes.pipe(res);
    })
    .on("error", (err) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Internal Server Error while proxying");
    });
});

app.options("/*", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "*");
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`MangaDex image proxy running on port ${PORT}`);
});

function normalizeImagePath(input) {
  let imagePath = decodeURIComponent(String(input)).trim();
  imagePath = imagePath.replace(/^https?:\/\/(uploads\.)?mangadex\.org\//i, "");
  imagePath = imagePath.replace(/^\/+/, "");
  return imagePath;
}
