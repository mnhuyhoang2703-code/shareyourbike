// db.js — Lưu trữ bằng libSQL/Turso. Cùng MỘT API async chạy được cả:
//   - LOCAL/dev/test: file SQLite (url "file:...") — không cần mạng, không tốn tiền.
//   - PRODUCTION (Vercel): Turso remote (url "libsql://..." + authToken) — vì
//     filesystem của Vercel chỉ đọc + tạm thời, không giữ được file .db.
//
// Vì sao đổi từ node:sqlite sang libsql: node:sqlite ghi file trên đĩa local, mất
// sạch trên hosting serverless. libsql cho phép ghi vào DB remote bền vững mà vẫn
// dùng được file local khi phát triển. Đánh đổi: thêm 1 dependency (@libsql/client)
// và mọi hàm DB trở thành async.

const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

// Chọn nơi lưu:
//  1. TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) — production trên Vercel.
//  2. SYB_DB — đường dẫn file, dùng cho test (mỗi test một file riêng).
//  3. Mặc định: file shareyourbike.db cùng thư mục (chạy local như trước).
function chonUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  const file = process.env.SYB_DB || path.join(__dirname, 'shareyourbike.db');
  return 'file:' + file;
}

const client = createClient({
  url: chonUrl(),
  authToken: process.env.TURSO_AUTH_TOKEN, // undefined với file: -> bỏ qua, không sao
});

// libsql trả về Row có cả khóa theo tên LẪN theo chỉ số. Ép về object thuần để
// phần còn lại của app (match.js, server.js) dùng như trước với node:sqlite.
function veObject(rs) {
  return rs.rows.map((r) => {
    const o = {};
    rs.columns.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
}
const veMot = (rs) => veObject(rs)[0] || undefined;

const chay = (sql, args = []) => client.execute({ sql, args });
const layMot = async (sql, args = []) => veMot(await chay(sql, args));
const layNhieu = async (sql, args = []) => veObject(await chay(sql, args));

// ---- Khởi tạo schema (idempotent) ----
async function themCotNeuThieu(bang, ten, kieuVaMacDinh) {
  const cot = await layNhieu(`PRAGMA table_info(${bang})`);
  if (!cot.some((c) => c.name === ten)) {
    await chay(`ALTER TABLE ${bang} ADD COLUMN ${ten} ${kieuVaMacDinh}`);
  }
}

async function _khoiTao() {
  await chay(`
    CREATE TABLE IF NOT EXISTS trips (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      role        TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      phone       TEXT    NOT NULL,
      email       TEXT,
      start_label TEXT    NOT NULL,
      start_lat   REAL    NOT NULL,
      start_lon   REAL    NOT NULL,
      end_label   TEXT    NOT NULL,
      end_lat     REAL    NOT NULL,
      end_lon     REAL    NOT NULL,
      pickup      TEXT    NOT NULL,
      dropoff     TEXT,
      days        TEXT    NOT NULL,
      price       INTEGER NOT NULL DEFAULT 0,
      note        TEXT,
      created_at  TEXT    NOT NULL
    )`);
  await chay(`
    CREATE TABLE IF NOT EXISTS interests (
      from_id    INTEGER NOT NULL,
      to_id      INTEGER NOT NULL,
      created_at TEXT    NOT NULL,
      PRIMARY KEY (from_id, to_id)
    )`);

  // Nâng cấp bảng cũ (không mất dữ liệu). SQLite không có ADD COLUMN IF NOT EXISTS.
  await themCotNeuThieu('trips', 'vehicle_type', 'TEXT');
  await themCotNeuThieu('trips', 'vehicle_model', 'TEXT');
  await themCotNeuThieu('trips', 'want_type', "TEXT DEFAULT 'any'");
  await themCotNeuThieu('trips', 'route', 'TEXT');
  await themCotNeuThieu('trips', 'route_km', 'REAL');
}

// Chạy khởi tạo MỘT lần cho mỗi tiến trình; mọi hàm DB đều await cổng này trước.
let _sanSang = null;
function sanSang() {
  if (!_sanSang) _sanSang = _khoiTao();
  return _sanSang;
}

// Bỏ ký tự dễ nhìn nhầm (0/O, 1/I/L) để đọc mã qua điện thoại không sai
const BANG_CHU = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Mã mới 6 ký tự (rút gọn theo feedback Hoàng 23/07/2026). Mã cũ 8 ký tự vẫn
// tra được vì xác thực bằng so khớp chính xác. 31^6 ≈ 887 triệu tổ hợp + phải
// đúng SĐT → vẫn quá đủ chống dò.
function sinhMa(doDai = 6) {
  const bytes = crypto.randomBytes(doDai);
  let s = '';
  for (let i = 0; i < doDai; i++) s += BANG_CHU[bytes[i] % BANG_CHU.length];
  return s;
}

async function sinhMaDuyNhat() {
  for (let i = 0; i < 20; i++) {
    const ma = sinhMa();
    if (!(await layMot('SELECT 1 AS x FROM trips WHERE code = ?', [ma]))) return ma;
  }
  throw new Error('Khong sinh duoc ma duy nhat');
}

async function taoChuyen(t) {
  await sanSang();
  const code = await sinhMaDuyNhat();
  await chay(`
    INSERT INTO trips (code, role, name, phone, email, start_label, start_lat, start_lon,
                       end_label, end_lat, end_lon, pickup, dropoff, days, price, note,
                       vehicle_type, vehicle_model, want_type, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    code, t.role, t.name, t.phone, t.email || null,
    t.start_label, t.start_lat, t.start_lon,
    t.end_label, t.end_lat, t.end_lon,
    t.pickup, t.dropoff || null, t.days, t.price || 0, t.note || null,
    t.vehicle_type || null, t.vehicle_model || null, t.want_type || 'any',
    new Date().toISOString(),
  ]);
  return layTheoMa(code);
}

/**
 * `route` lưu dạng chuỗi JSON. Mọi nơi đọc chuyến PHẢI đi qua đây để nhận về MẢNG,
 * nếu không match.js sẽ thấy chuỗi và lặng lẽ bỏ luật "điểm đến nằm trên tuyến".
 */
function doiDangChuyen(row) {
  if (!row) return row;
  let route = null;
  if (row.route) {
    try {
      const r = JSON.parse(row.route);
      if (Array.isArray(r) && r.length > 1) route = r;
    } catch { /* dữ liệu hỏng thì coi như chưa có tuyến */ }
  }
  return { ...row, route };
}

async function layTheoMa(code) {
  await sanSang();
  return doiDangChuyen(await layMot('SELECT * FROM trips WHERE code = ?', [code]));
}
async function layTheoId(id) {
  await sanSang();
  return doiDangChuyen(await layMot('SELECT * FROM trips WHERE id = ?', [id]));
}
async function layTatCa() {
  await sanSang();
  return (await layNhieu('SELECT * FROM trips ORDER BY id')).map(doiDangChuyen);
}

/** Các chuyến của người CÓ XE mà chưa lấy được tuyến đường. */
async function layChuyenThieuTuyen() {
  await sanSang();
  return layNhieu("SELECT * FROM trips WHERE role = 'driver' AND route IS NULL ORDER BY id");
}

async function luuTuyen(id, route, routeKm) {
  await sanSang();
  await chay('UPDATE trips SET route = ?, route_km = ? WHERE id = ?',
    [route ? JSON.stringify(route) : null, routeKm ?? null, id]);
}

/** Ghi nhận "chuyến from quan tâm chuyến to". Gọi lại nhiều lần vẫn an toàn. */
async function bayToQuanTam(fromId, toId) {
  await sanSang();
  await chay('INSERT OR IGNORE INTO interests (from_id, to_id, created_at) VALUES (?,?,?)',
    [fromId, toId, new Date().toISOString()]);
}

async function daQuanTam(fromId, toId) {
  await sanSang();
  return Boolean(await layMot(
    'SELECT 1 AS x FROM interests WHERE from_id = ? AND to_id = ?', [fromId, toId]));
}

/** Hai chiều = cả hai bên đều đã bấm quan tâm. Chỉ khi đó mới được lộ SĐT. */
async function laMatchHaiChieu(a, b) {
  return (await daQuanTam(a, b)) && (await daQuanTam(b, a));
}

module.exports = {
  client, sanSang, taoChuyen, layTheoMa, layTheoId, layTatCa,
  layChuyenThieuTuyen, luuTuyen,
  bayToQuanTam, daQuanTam, laMatchHaiChieu, sinhMa,
};
