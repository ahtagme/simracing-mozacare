# 🔧 SETUP ADMIN DASHBOARD

Setelah push ke GitHub, ada **2 setup manual di Cloudflare** yang harus dikerjain (sekali aja).

---

## STEP 1: Bikin D1 Database (5 menit)

### A. Buat database

1. Login Cloudflare → menu kiri → **Workers & Pages** → tab **D1 SQL Database**
2. Klik **Create**
3. Nama database: `simracing_orders`
4. Lokasi: `Asia-Pacific (APAC)` — paling deket Indonesia
5. Klik **Create**

### B. Jalankan schema SQL

1. Di database yang baru jadi → tab **Console**
2. Copy-paste isi file `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  customer_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  city TEXT,
  wheel TEXT,
  service TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  schedule TEXT,
  game TEXT,
  notes TEXT,
  source TEXT,
  status TEXT DEFAULT 'pending',
  updated_at TEXT,
  internal_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
```

3. Klik **Execute** → harusnya muncul "Query executed successfully"

---

## STEP 2: Bind D1 ke Pages Project + Set Environment Variables

### A. Bind D1 database

1. Cloudflare → **Workers & Pages** → klik project **`simracing-mozacare`**
2. Tab **Settings** → scroll ke **Functions** → **D1 database bindings**
3. Klik **Add binding**:
   - **Variable name**: `DB` ⚠️ (HARUS persis "DB", capital)
   - **D1 database**: pilih `simracing_orders`
4. Klik **Save**

### B. Set Environment Variables

Masih di **Settings** → scroll ke **Environment variables** (di bawah Functions):

Klik **Add variable** untuk setiap ini:

| Variable name | Value | Type |
|---------------|-------|------|
| `ADMIN_PASSWORD` | (password admin login) | **Encrypt** ✅ |
| `TELEGRAM_BOT_TOKEN` | (optional) | **Encrypt** ✅ |
| `TELEGRAM_CHAT_ID` | (optional) | **Encrypt** ✅ |

> **ADMIN_PASSWORD** = password yang akan kamu pakai login ke `/admin`. Pilih password yang kuat (min 12 karakter, mix huruf+angka+simbol).
>
> Telegram variables OPTIONAL — kalau kamu mau dapet notif Telegram setiap order baru.

### C. Re-deploy

Setelah set variables, **WAJIB redeploy** biar variables ke-apply:

1. Tab **Deployments**
2. Klik **3 dots** di latest deployment → **Retry deployment**

Tunggu ~30 detik.

---

## STEP 3: Test! (3 menit)

### Test admin login:
1. Buka: **https://simracing.mozacare.id/admin**
2. Input password yang kamu set di `ADMIN_PASSWORD`
3. Harusnya masuk ke dashboard (kosong, belum ada order)

### Test form order:
1. Buka: **https://simracing.mozacare.id**
2. Klik tombol **"Order Sekarang"** di salah satu paket
3. Isi form dengan data dummy
4. Klik **"Lanjut ke WhatsApp"**
5. WhatsApp kamu terbuka (sudah benar)

### Verify masuk database:
6. Refresh **https://simracing.mozacare.id/admin**
7. Order tadi harusnya muncul di tabel ✅

Kalau ya → **DASHBOARD WORK!** 🎉

---

## (OPTIONAL) STEP 4: Setup Telegram Bot Notification

Kalau mau dapet notif HP Telegram setiap order baru:

### A. Buat bot
1. Buka Telegram → search **@BotFather**
2. Ketik `/newbot`
3. Beri nama: `AHTA Order Bot`
4. Username: `ahta_order_bot` (harus unik, akhiri dengan `_bot`)
5. Dapat **Bot Token** (format: `123456789:ABC-DEF...`) → COPY

### B. Get Chat ID kamu
1. Buka chat ke bot kamu di Telegram → tap **Start**
2. Buka URL ini di browser (ganti TOKEN):
   ```
   https://api.telegram.org/botTOKEN/getUpdates
   ```
3. Cari `"chat":{"id":123456789` → angka itu **Chat ID** kamu

### C. Set ke Cloudflare
1. Pages project → Settings → Environment variables
2. Tambah:
   - `TELEGRAM_BOT_TOKEN` = bot token tadi
   - `TELEGRAM_CHAT_ID` = chat id tadi
3. Encrypt ✅
4. Redeploy

Sekarang setiap order baru → notif HP Telegram instant! 📱

---

## 🆘 Troubleshooting

### "Login gagal" padahal password benar
- Cek `ADMIN_PASSWORD` env var udah di-set
- Sudah re-deploy setelah set variables?

### "Network error" atau order gak masuk database
- Cek D1 binding `DB` udah betul
- Check logs: Pages project → tab **Functions** → **Logs**

### Dashboard kosong terus padahal udah submit form
- Cek browser DevTools (F12) → Network tab → liat respon `/api/submit` (harusnya 200 OK)
- Cek D1 console: `SELECT * FROM orders` — kalau kosong, berarti form ga sampai database

### Cara lihat data D1 manual
- Cloudflare → Workers & Pages → D1 → simracing_orders → Console
- Run: `SELECT * FROM orders ORDER BY id DESC LIMIT 10`

---

## 📊 Endpoint Reference

| URL | Method | Auth | Fungsi |
|-----|--------|------|--------|
| `/` | GET | - | Landing page |
| `/admin/` | GET | - | Login + dashboard |
| `/api/submit` | POST | - | Form submission (public) |
| `/api/login` | POST | - | Login dapatkan token |
| `/api/orders` | GET | ✅ | List semua orders |
| `/api/orders` | POST | ✅ | Create manual order |
| `/api/orders/:id` | PATCH | ✅ | Update status/notes |
| `/api/orders/:id` | DELETE | ✅ | Hapus order |

---

## 🔐 Security Notes

- ✅ `ADMIN_PASSWORD` di-encrypt di Cloudflare (gak terbaca dari code)
- ✅ Auth pakai HMAC-signed token (expire 7 hari)
- ✅ All API protected (kecuali `/api/submit` public)
- ✅ HTTPS auto via Cloudflare
- ⚠️ JANGAN share password admin ke siapa-siapa
- ⚠️ Kalau curiga password leaked → ganti `ADMIN_PASSWORD` env var, semua session lama auto-invalid
