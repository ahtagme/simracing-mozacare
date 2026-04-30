// PATCH /api/orders/:id - Update status / notes
export async function onRequestPatch({ params, request, env }) {
  const { id } = params;
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

  if (updates.length === 0) {
    return jsonError(400, 'Nothing to update');
  }

  updates.push(`updated_at = datetime('now', 'localtime')`);
  values.push(id);

  await env.DB.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// DELETE /api/orders/:id
export async function onRequestDelete({ params, env }) {
  const { id } = params;
  await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
