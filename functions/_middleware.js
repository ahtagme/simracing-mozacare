// Auth middleware untuk endpoint /api/orders/*
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Hanya protect /api/orders endpoints
  if (!url.pathname.startsWith('/api/orders')) {
    return next();
  }

  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();

  if (!token) {
    return jsonError(401, 'Missing token');
  }

  const [ts, sig] = token.split('.');
  if (!ts || !sig) return jsonError(401, 'Invalid token format');

  // Cek expiry (7 hari)
  const age = Date.now() - parseInt(ts);
  if (age > 7 * 24 * 60 * 60 * 1000) {
    return jsonError(401, 'Token expired');
  }

  // Verify HMAC signature
  const expected = await sign(ts, env.ADMIN_PASSWORD);
  if (sig !== expected) {
    return jsonError(401, 'Invalid signature');
  }

  return next();
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
