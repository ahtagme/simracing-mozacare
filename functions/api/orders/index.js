// GET /api/orders - List semua orders dengan filter
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
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

  // Stats
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

  return new Response(JSON.stringify({
    ok: true,
    orders: result.results,
    stats,
  }), { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/orders - Create order manually (admin)
export async function onRequestPost({ request, env }) {
  const body = await request.json();

  const result = await env.DB.prepare(`
    INSERT INTO orders (customer_name, whatsapp, city, wheel, service, price, method, schedule, game, notes, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    body.source || 'admin',
    body.status || 'pending',
  ).run();

  return new Response(JSON.stringify({ ok: true, id: result.meta.last_row_id }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
