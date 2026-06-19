const DEFAULT_ALLOW_HEADERS =
  "Accept, Authorization, Cache-Control, Content-Type, DNT, If-Modified-Since, Keep-Alive, Origin, User-Agent, X-Requested-With";

const DROP_HEADERS = new Set([
  "accept-encoding",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "content-length",
  "cookie",
  "host",
  "origin",
  "referer",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-storage-access",
  "sec-fetch-user",
  "true-client-ip",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
]);

export default {
  async fetch(request: Request): Promise<Response> {
    const reqHeaders = new Headers(request.headers);
    const responseHeaders = corsHeaders(reqHeaders);

    try {
      const target = parseTargetUrl(request.url);

      if (request.method === "OPTIONS" || !target) {
        return new Response(await getHelp(new URL(request.url)), {
          status: request.method === "OPTIONS" ? 200 : 400,
          headers: withContentType(responseHeaders, "text/html; charset=utf-8"),
        });
      }

      const upstreamRequest: RequestInit = {
        method: request.method,
        headers: upstreamHeaders(reqHeaders),
      };

      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        upstreamRequest.body = await requestBody(request, reqHeaders);
      }

      const upstreamResponse = await fetch(target, upstreamRequest);
      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) {
        responseHeaders.set("content-type", contentType);
      }
      responseHeaders.set("cache-control", "no-store");

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          code: -1,
          msg: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: withContentType(responseHeaders, "application/json; charset=utf-8"),
        }
      );
    }
  },
};

function corsHeaders(requestHeaders: Headers) {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      requestHeaders.get("access-control-request-headers") || DEFAULT_ALLOW_HEADERS,
  });
}

function parseTargetUrl(requestUrl: string) {
  const current = new URL(requestUrl);
  let rawTarget = decodeURIComponent(current.pathname.slice(1));

  if (
    rawTarget.length < 3 ||
    rawTarget.indexOf(".") === -1 ||
    rawTarget === "favicon.ico" ||
    rawTarget === "robots.txt"
  ) {
    return null;
  }

  rawTarget = fixUrl(rawTarget);

  if (!isAllowedTarget(rawTarget)) {
    throw new Error("Only MangaDex auth/API URLs are allowed by this proxy.");
  }

  if (current.search) {
    rawTarget += current.search;
  }

  return rawTarget;
}

function isAllowedTarget(url: string) {
  const parsed = new URL(url);
  return (
    parsed.protocol === "https:" &&
    (parsed.hostname === "auth.mangadex.org" || parsed.hostname === "api.mangadex.org")
  );
}

function fixUrl(url: string) {
  if (url.includes("://")) {
    return url;
  }

  if (url.includes(":/")) {
    return url.replace(":/", "://");
  }

  return `https://${url}`;
}

function upstreamHeaders(requestHeaders: Headers) {
  const headers = new Headers();

  requestHeaders.forEach((value, key) => {
    if (!DROP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  if (!headers.has("user-agent")) {
    headers.set("user-agent", "MangaDex-Auth-Proxy/1.0");
  }

  return headers;
}

async function requestBody(request: Request, requestHeaders: Headers) {
  const contentType = (requestHeaders.get("content-type") || "").toLowerCase();

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("application/json") ||
    contentType.includes("application/text") ||
    contentType.includes("text/")
  ) {
    return request.text();
  }

  if (contentType.includes("multipart/form-data")) {
    return request.formData();
  }

  return request.arrayBuffer();
}

function withContentType(headers: Headers, contentType: string) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("content-type", contentType);
  return nextHeaders;
}

async function getHelp(url: URL) {
  const origin = `${url.protocol}//${url.hostname}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MangaDex Auth Proxy</title>
    <style>
      body {
        max-width: 780px;
        margin: 40px auto;
        padding: 0 18px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        line-height: 1.55;
      }
      code {
        background: #f1f5f9;
        padding: 2px 5px;
      }
      pre {
        background: #0f172a;
        color: #e2e8f0;
        overflow: auto;
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <h1>MangaDex Auth Proxy</h1>
    <p>Proxy MangaDex OAuth/API requests from a browser and inject CORS response headers.</p>
    <p>This worker only allows <code>auth.mangadex.org</code> and <code>api.mangadex.org</code>.</p>
    <h2>Usage</h2>
    <pre>${origin}/https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token</pre>
    <h2>Important</h2>
    <p>This proxy can see credentials and refresh tokens sent through it. Deploy your own worker and do not use a random public proxy for auth.</p>
  </body>
</html>`;
}
