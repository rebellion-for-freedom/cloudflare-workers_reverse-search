addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const targetUrl = 'https://rebel-search.onrender.com/';
  const url = new URL(request.url);
  
  // Rewrite URL to target
  url.hostname = 'rebel-search.onrender.com/';
  url.protocol = 'https:';
  url.port = '';

  // Build new request
  const proxyRequest = new Request(url.toString(), {
    method: request.method,
    headers: new Headers(request.headers), // copy headers
    body: request.body,
    redirect: 'manual' // avoid auto-redirect loops
  });

  // Important: preserve original host for Vercel routing / security checks
  proxyRequest.headers.set('Host', 'orsons-snorlax.vercel.app');
  proxyRequest.headers.set('X-Forwarded-Host', request.headers.get('host') || '');
  proxyRequest.headers.delete('CF-Connecting-IP'); // optional: avoid confusion

  try {
    let response = await fetch(proxyRequest, {
      // Enable streaming + reduce overhead
      redirect: 'manual',
      cf: {
        // Hint Cloudflare to cache static assets aggressively
        cacheEverything: true,
        cacheTtlByStatus: [
          { codes: [200, 203], cacheTtl: 86400 }, // 1 day for good responses
          { codes: "404", cacheTtl: 3600 }
        ]
      }
    });

    // Clone and modify response for CORS / security if needed
    response = new Response(response.body, response);
    response.headers.set('Access-Control-Allow-Origin', '*'); // if your use-case needs it

    // Force streaming where possible (reduces TTFB perceived lag)
    if (response.body) {
      response.headers.set('Content-Encoding', 'identity'); // avoid double-compress
    }

    return response;
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
