// POST /api/submit - Receive order from form (PUBLIC, no auth)
export async function onRequestPost({ request, env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.customer_name || !body.whatsapp || !body.service) {
      return new Response(JSON.stringify({
        ok: false, error: 'Field wajib: customer_name, whatsapp, service'
      }), { status: 400, headers: cors });
    }

    // Insert ke D1
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

    // Optional: kirim notif Telegram kalau env var di-set
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const msg = formatTelegramMessage(body, result.meta.last_row_id);
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, msg);
    }

    return new Response(JSON.stringify({
      ok: true,
      id: result.meta.last_row_id,
      message: 'Order tersimpan'
    }), { status: 200, headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false, error: err.message
    }), { status: 500, headers: cors });
  }
}

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
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

async function sendTelegram(token, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (e) { /* silent fail, jangan ganggu user flow */ }
}
