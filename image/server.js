const express = require("express");
const https = require("https");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 7860;
const UPLOADS_ORIGIN = "https://uploads.mangadex.org";
const SITE_ORIGIN = "https://mangadex.org";
const UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.UPSTREAM_TIMEOUT_MS || "30000", 10);
const ERROR_BODY_LIMIT = Number.parseInt(process.env.ERROR_BODY_LIMIT || "2048", 10);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/*", (req, res) => {
  const requestId = req.get("x-request-id") || randomUUID().slice(0, 8);
  let imagePath = req.params[0];

  if (!imagePath && req.query.url) {
    imagePath = String(req.query.url);
  }

  if (!imagePath) {
    logEvent("warn", requestId, "missing image path", requestDetails(req));
    return res.status(400).send("Image path required");
  }

  imagePath = normalizeImagePath(imagePath);

  if (!imagePath.startsWith("covers/")) {
    logEvent("warn", requestId, "rejected non-cover path", {
      ...requestDetails(req),
      imagePath,
    });
    return res.status(400).send("Only MangaDex cover paths are supported");
  }

  const candidates = [
    { label: "uploads", url: `${UPLOADS_ORIGIN}/${imagePath}` },
    { label: "site", url: `${SITE_ORIGIN}/${imagePath}` },
  ];

  logEvent("info", requestId, "proxy request", {
    ...requestDetails(req),
    imagePath,
    candidates: candidates.map((candidate) => candidate.url),
  });

  proxyFromCandidates({
    candidates,
    requestId,
    requestMethod: req.method,
    response: res,
    errors: [],
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

function proxyFromCandidates({ candidates, requestId, requestMethod, response, errors }) {
  const [candidate, ...remainingCandidates] = candidates;

  if (!candidate) {
    const status = errors.find((error) => Number.isInteger(error.status))?.status || 502;
    response.set("Access-Control-Allow-Origin", "*");
    response.set("X-Proxy-Request-Id", requestId);
    response.status(status).send(
      [
        `Image not found or error from upstream. requestId=${requestId}`,
        ...errors.map((error) => `${error.label}: ${error.status || "error"} ${error.message || ""}`),
      ].join("\n")
    );
    return;
  }

  const upstreamRequest = https.get(
    candidate.url,
    {
      method: requestMethod,
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: upstreamHeaders(),
    },
    (upstreamResponse) => {
      const statusCode = upstreamResponse.statusCode || 502;
      const responseHeaders = selectedHeaders(upstreamResponse.headers);

      logEvent("info", requestId, "upstream response", {
        label: candidate.label,
        url: candidate.url,
        statusCode,
        statusMessage: upstreamResponse.statusMessage,
        headers: responseHeaders,
      });

      if (statusCode === 200) {
        response.set("Access-Control-Allow-Origin", "*");
        response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.set("Access-Control-Allow-Headers", "*");
        response.set("Cross-Origin-Resource-Policy", "cross-origin");
        response.set("X-Proxy-Request-Id", requestId);
        response.set("X-Proxy-Upstream", candidate.label);
        response.set("Content-Type", upstreamResponse.headers["content-type"] || "application/octet-stream");
        response.set("Cache-Control", "public, max-age=31536000, immutable");

        upstreamResponse.pipe(response);
        response.on("finish", () => {
          logEvent("info", requestId, "proxy response complete", {
            label: candidate.label,
            statusCode: response.statusCode,
          });
        });
        return;
      }

      collectErrorBody(upstreamResponse, (bodySnippet) => {
        const upstreamError = {
          label: candidate.label,
          url: candidate.url,
          status: statusCode,
          message: upstreamResponse.statusMessage,
          headers: responseHeaders,
          bodySnippet,
        };
        logEvent("warn", requestId, "upstream non-200", upstreamError);
        proxyFromCandidates({
          candidates: remainingCandidates,
          requestId,
          requestMethod,
          response,
          errors: [...errors, upstreamError],
        });
      });
    }
  );

  upstreamRequest.on("timeout", () => {
    upstreamRequest.destroy(new Error(`Upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`));
  });

  upstreamRequest.on("error", (err) => {
    const upstreamError = {
      label: candidate.label,
      url: candidate.url,
      message: err.message,
    };
    logEvent("error", requestId, "upstream request failed", upstreamError);
    proxyFromCandidates({
      candidates: remainingCandidates,
      requestId,
      requestMethod,
      response,
      errors: [...errors, upstreamError],
    });
  });
}

function upstreamHeaders() {
  return {
    Referer: "https://mangadex.org/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    DNT: "1",
  };
}

function collectErrorBody(stream, onDone) {
  const chunks = [];
  let collected = 0;

  stream.on("data", (chunk) => {
    if (collected >= ERROR_BODY_LIMIT) {
      return;
    }

    const remaining = ERROR_BODY_LIMIT - collected;
    const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    chunks.push(piece);
    collected += piece.length;
  });

  stream.on("end", () => {
    onDone(Buffer.concat(chunks).toString("utf8"));
  });

  stream.on("error", (err) => {
    onDone(`Failed to read upstream error body: ${err.message}`);
  });
}

function requestDetails(req) {
  return {
    method: req.method,
    originalUrl: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    referer: req.get("referer"),
  };
}

function selectedHeaders(headers) {
  return {
    "content-type": headers["content-type"],
    "content-length": headers["content-length"],
    server: headers.server,
    via: headers.via,
    "x-request-id": headers["x-request-id"],
    "x-cache": headers["x-cache"],
  };
}

function logEvent(level, requestId, message, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    requestId,
    message,
    ...details,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
