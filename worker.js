const ORIGIN = 'https://rebel-search.onrender.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Optional health check
    if (url.pathname === '/__health') {
      return new Response('OK', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Build upstream URL (path + query preserved)
    const upstreamUrl = new URL(ORIGIN);
    upstreamUrl.pathname = url.pathname;
    upstreamUrl.search = url.search;

    const isImage = isImageRequest(url.pathname, request.headers);

    if (isImage) {
      return handleImageProxy(request, upstreamUrl, ctx);
    }

    return handleGenericProxy(request, upstreamUrl);
  },
};

function isImageRequest(pathname, headers) {
  const lower = pathname.toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'];
  if (imageExts.some(ext => lower.endsWith(ext))) return true;

  const accept = headers.get('accept') || '';
  if (accept.includes('image/')) return true;

  return false;
}

async function handleGenericProxy(clientRequest, upstreamUrl) {
  const init = buildUpstreamInit(clientRequest);

  const upstreamResponse = await fetch(upstreamUrl.toString(), init);

  const responseHeaders = new Headers(upstreamResponse.headers);
  stripHopByHopHeaders(responseHeaders);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

async function handleImageProxy(clientRequest, upstreamUrl, ctx) {
  const cache = caches.default;

  const cacheKey = new Request(clientRequest.url, {
    method: 'GET',
    headers: { 'Accept': clientRequest.headers.get('accept') || '' },
  });

  // Try cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const init = buildUpstreamInit(clientRequest);
  init.method = 'GET';
  init.body = undefined;

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    ...init,
    cf: {
      cacheTtl: 60 * 60, // 1 hour
      cacheEverything: true,
      // Optional image optimization:
      // image: {
      //   width: 1920,
      //   height: 1080,
      //   fit: 'scale-down',
      // },
    },
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  stripHopByHopHeaders(responseHeaders);

  if (!responseHeaders.get('content-type')) {
    responseHeaders.set('content-type', 'image/*');
  }

  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  if (upstreamResponse.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

function buildUpstreamInit(clientRequest) {
  const headers = new Headers(clientRequest.headers);

  headers.set('Host', new URL(ORIGIN).host);
  headers.delete('content-encoding');

  return {
    method: clientRequest.method,
    headers,
    body:
      clientRequest.method === 'GET' || clientRequest.method === 'HEAD'
        ? undefined
        : clientRequest.body,
    redirect: 'follow',
  };
}

function stripHopByHopHeaders(headers) {
  const hopByHop = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ];
  for (const h of hopByHop) headers.delete(h);
}
