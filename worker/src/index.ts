export interface Env {
  /**
   * Durable cache for PGP assets. Keys are normalized URL paths (e.g. `/shaquille.asc`).
   */
  PGP_ASSETS: KVNamespace;
  /**
   * Optional override for the asset served when `/` is requested.
   * Defaults to `/public-masterkey.asc`.
   */
  ROOT_OBJECT?: string;
  /**
   * Optional override for the upstream mirror; defaults to the GitHub repo raw URL.
   */
  GITHUB_MIRROR_BASE?: string;
  /**
   * Optional comma-delimited allow-list of hostnames permitted to use this worker.
   * When omitted, the worker accepts requests for any hostname.
   */
  ALLOWED_HOSTS?: string;
}

const DEFAULT_GITHUB_BASE =
  "https://raw.githubusercontent.com/kareemlukitomo/pgp/main";
const KV_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — refreshed by rotation workflow.
const DEFAULT_ROOT_OBJECT = "/public-masterkey.asc";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Accept-Encoding, Origin",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!isAllowedHost(request, env)) {
      return withCors(new Response("Forbidden host", { status: 403 }));
    }

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withCors(new Response("Method Not Allowed", { status: 405 }));
    }

    const url = new URL(request.url);
    const normalized = normalizePath(url.pathname);
    const isRootRequest = normalized === null;

    const key = normalized ?? resolveRootObject(env);
    if (!key) {
      return withCors(new Response("Not Found", { status: 404 }));
    }

    const cached = await env.PGP_ASSETS.getWithMetadata<ArrayBuffer, Metadata>(
      key,
      {
        type: "arrayBuffer",
      },
    );

    if (cached?.value) {
      const headers = buildResponseHeaders(key, cached.metadata, isRootRequest);
      return finalizeResponse(request.method, cached.value, headers);
    }

    const originResponse = await fetchFromMirror(env, key);

    if (originResponse.status === 404) {
      if (!isRootRequest) {
        return withCors(new Response("Not Found", { status: 404 }));
      }
      // If the root object is missing, treat it as a configuration issue and surface 500.
      return withCors(new Response("Root object missing", { status: 500 }));
    }

    if (!originResponse.ok) {
      console.warn(`Mirror fetch failed: ${originResponse.status} ${originResponse.statusText} for ${key}`);
      return withCors(new Response("Upstream failure", { status: 502 }));
    }

    const buffer = await originResponse.arrayBuffer();
    const metadata = prepareMetadata(key, originResponse.headers);
    const headers = buildResponseHeaders(key, metadata, isRootRequest);

    ctx.waitUntil(
      env.PGP_ASSETS.put(key, buffer, {
        expirationTtl: KV_CACHE_TTL_SECONDS,
        metadata,
      }),
    );

    return finalizeResponse(request.method, buffer, headers);
  },
};

type Metadata = {
  contentType: string;
};

function buildResponseHeaders(
  key: string,
  metadata: Metadata | null | undefined,
  forceTextPlain = false,
): Headers {
  const headers = new Headers({
    "Cache-Control": "public, max-age=300, immutable",
    ...CORS_HEADERS,
  });

  const contentType = forceTextPlain
    ? "text/plain; charset=utf-8"
    : metadata?.contentType ?? inferContentType(key);
  headers.set("Content-Type", contentType);

  return headers;
}

function prepareMetadata(path: string, headers: Headers): Metadata {
  const upstreamType = headers.get("content-type") ?? undefined;
  return {
    contentType: inferContentType(path, upstreamType),
  };
}

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function handleOptions(_request: Request): Response {
  const response = new Response(null, { status: 204 });
  return withCors(response);
}

function finalizeResponse(
  method: string,
  body: ArrayBuffer,
  headers: Headers,
): Response {
  if (method === "HEAD") {
    return withCors(new Response(null, { status: 200, headers }));
  }

  return withCors(new Response(body, { status: 200, headers }));
}

function normalizePath(pathname: string): string | null {
  if (!pathname || pathname === "/") {
    return null;
  }

  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.includes("\0")) {
      return null;
    }
  }

  return `/${segments.join("/")}`;
}

function inferContentType(path: string, upstream?: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith("policy") || lower.endsWith("host") || lower.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }

  if (upstream && !upstream.includes("text/html")) {
    return upstream;
  }

  return "application/octet-stream";
}

async function fetchFromMirror(env: Env, key: string): Promise<Response> {
  const base = env.GITHUB_MIRROR_BASE?.trim() || DEFAULT_GITHUB_BASE;
  const origin = new URL(base + key);

  return fetch(origin.toString(), {
    cf: {
      cacheEverything: true,
      cacheTtl: 60,
    },
    headers: {
      "User-Agent": "kareem.one-pgp-worker/1.0",
      "Accept": "application/octet-stream",
    },
  });
}

function isAllowedHost(request: Request, env: Env): boolean {
  const raw = env.ALLOWED_HOSTS;
  if (!raw) {
    return true;
  }

  const hostHeader = request.headers.get("host");
  if (!hostHeader) {
    return false;
  }

  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowed.length === 0 || allowed.includes(hostHeader.toLowerCase());
}

function resolveRootObject(env: Env): string | null {
  const root = env.ROOT_OBJECT?.trim() ?? DEFAULT_ROOT_OBJECT;
  if (!root) {
    return null;
  }
  if (!root.startsWith("/")) {
    return `/${root}`;
  }
  return root;
}
