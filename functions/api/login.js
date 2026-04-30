// POST /api/login - Validate password, return session token
export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { password } = await request.json();

    if (!password || password !== env.ADMIN_PASSWORD) {
      // Slow down brute force
      await new Promise(r => setTimeout(r, 800));
      return new Response(JSON.stringify({
        ok: false, error: 'Password salah'
      }), { status: 401, headers });
    }

    // Generate session token (HMAC-signed timestamp)
    const ts = Date.now();
    const sig = await sign(ts.toString(), env.ADMIN_PASSWORD);
    const token = `${ts}.${sig}`;

    return new Response(JSON.stringify({
      ok: true,
      token,
      expires_in: 7 * 24 * 60 * 60 // 7 hari
    }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false, error: err.message
    }), { status: 500, headers });
  }
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
