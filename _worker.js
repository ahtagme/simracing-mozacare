// AHTA Sim Racing Service - Cloudflare Worker
// Handles /api/* routes + serves static assets

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    try {
      // ========== API ROUTES ==========
      if (pathname.startsWith('/api/')) {
        return await handleAPI(request, env, url, pathname, method);
      }

      // ========== STATIC ASSETS ==========
      return await env.ASSETS.fetch(request);

    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }
};

// =====================================================
// API ROUTER
// =====================================================
async function handleAPI(request, env, url, pathname, method) {
  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  // Public endpoints
  if (pathname === '/api/submit' && method === 'POST') return handleSubmit(request, env);
  if (pathname === '/api/login' && method === 'POST') return handleLogin(request, env);

  // Protected endpoints
  if (pathname.startsWith('/api/orders')) {
    const ok = await checkAuth(request, env);
    if (!ok) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    if (pathname === '/api/orders' && method === 'GET') return listOrders(url, env);
    if (pathname === '/api/orders' && method === 'POST') return createOrder(request, env);

    const m = pathname.match(/^\/api\/orders\/(\d+)$/);
    if (m) {
      const id = m[1];
      if (method === 'PATCH') return updateOrder(id, request, env);
      if (method === 'DELETE') return deleteOrder(id, env);
    }
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

// =====================================================
// PUBLIC: Submit Order (from form)
// =====================================================
async function handleSubmit(request, env) {
  const body = await request.json();

  if (!body.customer_name || !body.whatsapp || !body.service) {
    return jsonResponse({
      ok: false, error: 'Field wajib: customer_name, whatsapp, service'
    }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO orders (
      customer_name, whatsapp, city, wheel, service, price,
      method, schedule, game, notes, source, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    body.customer_name,
    body.whatsapp,
    body.city || null,
    body.wheel || null,
    body.service,
    parseInt(body.price) || 0,
    body.method || null,
    body.schedule || null,
    body.game || null,
    body.notes || null,
    body.source || null,
  ).run();

  // Optional: Telegram notification
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const msg = formatTelegramMessage(body, result.meta.last_row_id);
    fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'Markdown',
      }),
    }).catch(() => {});
  }

  return jsonResponse({
    ok: true,
    id: result.meta.last_row_id,
    message: 'Order tersimpan'
  });
}

// =====================================================
// PUBLIC: Login
// =====================================================
async function handleLogin(request, env) {
  const { password } = await request.json();

  if (!password || password !== env.ADMIN_PASSWORD) {
    await sleep(800);
    return jsonResponse({ ok: false, error: 'Password salah' }, 401);
  }

  const ts = Date.now();
  const sig = await sign(ts.toString(), env.ADMIN_PASSWORD);
  return jsonResponse({
    ok: true,
    token: `${ts}.${sig}`,
    expires_in: 7 * 24 * 60 * 60
  });
}

// =====================================================
// AUTH CHECK
// =====================================================
async function checkAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;

  const [ts, sig] = token.split('.');
  if (!ts || !sig) return false;

  const age = Date.now() - parseInt(ts);
  if (age > 7 * 24 * 60 * 60 * 1000) return false;

  const expected = await sign(ts, env.ADMIN_PASSWORD);
  return sig === expected;
}

// =====================================================
// PROTECTED: List orders + stats
// =====================================================
async function listOrders(url, env) {
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit')) || 200;

  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (customer_name LIKE ? OR whatsapp LIKE ? OR notes LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await env.DB.prepare(query).bind(...params).all();

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status='pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status='progress' THEN 1 END) as progress,
      COUNT(CASE WHEN status='done' THEN 1 END) as done,
      COUNT(CASE WHEN status='cancel' THEN 1 END) as cancel,
      COALESCE(SUM(CASE WHEN status='done' THEN price END), 0) as revenue,
      COALESCE(SUM(CASE WHEN status='done' AND created_at >= date('now', 'start of month') THEN price END), 0) as revenue_month,
      COALESCE(SUM(CASE WHEN status='done' AND created_at >= date('now') THEN price END), 0) as revenue_today
    FROM orders
  `).first();

  return jsonResponse({ ok: true, orders: result.results, stats });
}

// =====================================================
// PROTECTED: Create order manually
// =====================================================
async function createOrder(request, env) {
  const body = await request.json();
  const result = await env.DB.prepare(`
    INSERT INTO orders (customer_name, whatsapp, city, wheel, service, price, method, schedule, game, notes, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.customer_name, body.whatsapp, body.city || null, body.wheel || null,
    body.service, parseInt(body.price) || 0, body.method || null,
    body.schedule || null, body.game || null, body.notes || null,
    body.source || 'admin', body.status || 'pending',
  ).run();

  return jsonResponse({ ok: true, id: result.meta.last_row_id });
}

// =====================================================
// PROTECTED: Update order
// =====================================================
async function updateOrder(id, request, env) {
  const body = await request.json();
  const allowed = ['status', 'internal_notes', 'price'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (updates.length === 0) return jsonResponse({ ok: false, error: 'Nothing to update' }, 400);

  updates.push(`updated_at = datetime('now', 'localtime')`);
  values.push(id);

  await env.DB.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();

  return jsonResponse({ ok: true });
}

// =====================================================
// PROTECTED: Delete order
// =====================================================
async function deleteOrder(id, env) {
  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
  return jsonResponse({ ok: true });
}

// =====================================================
// HELPERS
// =====================================================
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatTelegramMessage(body, id) {
  let msg = `🔔 *ORDER BARU #${id}*\n\n`;
  msg += `🛠️ *Layanan:* ${body.service}\n`;
  if (body.price) msg += `💰 *Harga:* Rp ${parseInt(body.price).toLocaleString('id-ID')}\n`;
  msg += `\n👤 *Nama:* ${body.customer_name}\n`;
  msg += `📱 *WA:* ${body.whatsapp}\n`;
  if (body.city) msg += `📍 *Kota:* ${body.city}\n`;
  if (body.wheel) msg += `\n🚗 *Wheel:* ${body.wheel}\n`;
  if (body.method) msg += `🔧 *Metode:* ${body.method}\n`;
  if (body.schedule) msg += `📅 *Jadwal:* ${body.schedule}\n`;
  if (body.game) msg += `🎮 *Game:* ${body.game}\n`;
  if (body.notes) msg += `\n📝 *Catatan:*\n${body.notes}\n`;
  if (body.source) msg += `\n👀 *Source:* ${body.source}\n`;
  msg += `\n👉 https://simracing.mozacare.id/admin`;
  return msg;
}
