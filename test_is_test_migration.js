// test_is_test_migration.js — Chạy: node test_is_test_migration.js
// Kiểm tra riêng phần "đánh dấu dữ liệu test" (yêu cầu 24/07/2026 của Hoàng):
// khi cột is_test LẦN ĐẦU được thêm vào 1 DB đã có sẵn dữ liệu (mô phỏng đúng
// tình huống DB production Turso đang chạy trước khi tính năng này lên), toàn bộ
// dữ liệu đang có phải tự động thành is_test=1 — không còn ghép với người dùng
// thật (layDeMatch loại nó ra) nhưng vẫn còn nguyên để xem/debug (layTatCa).
// Chuyến tạo MỚI sau đó phải mặc định is_test=0 (thật).
//
// Chạy như 1 tiến trình node RIÊNG (không chung với test_api.js) vì cần mô phỏng
// đúng "DB đã tồn tại từ trước, chưa có cột is_test" trước khi db.js được require.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createClient } = require('@libsql/client');

let pass = 0, fail = 0;
function ok(ten, dieuKien) {
  console.log(`${dieuKien ? 'DAT ' : 'HONG'} | ${ten}`);
  dieuKien ? pass++ : fail++;
}

(async () => {
  const DB_TAM = path.join(os.tmpdir(), `syb_migration_${Date.now()}.db`);

  // 1) Dựng sẵn 1 bảng `trips` kiểu "TRƯỚC" tính năng này (không có is_test),
  //    chèn 1 chuyến — mô phỏng dữ liệu thật đã tồn tại trước khi tính năng lên.
  const raw = createClient({ url: 'file:' + DB_TAM });
  await raw.execute(`
    CREATE TABLE trips (
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
  await raw.execute({
    sql: `INSERT INTO trips (code, role, name, phone, start_label, start_lat, start_lon,
                              end_label, end_lat, end_lon, pickup, days, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: ['OLDCODE1', 'driver', 'Nguoi Cu', '0900000001', 'A', 10.77, 106.69,
      'B', 10.87, 106.80, '07:00', '2,3,4', new Date().toISOString()],
  });
  await raw.close();

  // 2) "Triển khai tính năng": require db.js trỏ tới CHÍNH DB này — sanSang() sẽ
  //    ALTER TABLE thêm các cột còn thiếu (gồm is_test) và chạy migration 1 lần.
  process.env.SYB_DB = DB_TAM;
  const store = require('./db.js');
  await store.sanSang();

  const tatCa = await store.layTatCa();
  ok('Dữ liệu cũ (tạo trước khi có is_test) tự động thành is_test=1',
    tatCa.length === 1 && tatCa[0].is_test === 1);
  ok('layDeMatch() không còn thấy dữ liệu cũ đó', (await store.layDeMatch()).length === 0);

  // 3) Chuyến MỚI tạo sau khi tính năng đã bật -> mặc định is_test=0 (thật)
  const moi = await store.taoChuyen({
    role: 'rider', name: 'Nguoi Moi', phone: '0900000002',
    start_label: 'C', start_lat: 10.78, start_lon: 106.70,
    end_label: 'D', end_lat: 10.88, end_lon: 106.81,
    pickup: '07:10', days: '2,3,4', price: 20000,
  });
  ok('Chuyến tạo MỚI mặc định is_test=0 (thật)', moi.is_test === 0);
  const hoUngVienSau = await store.layDeMatch();
  ok('layDeMatch() sau đó chỉ thấy đúng chuyến MỚI (không lẫn dữ liệu cũ)',
    hoUngVienSau.length === 1 && hoUngVienSau[0].code === moi.code);

  // 4) capNhatIsTest() gắn/gỡ cờ thủ công (dùng khi Hoàng cần đánh dấu tay)
  await store.capNhatIsTest(moi.id, true);
  const sauKhiGan = await store.layTheoId(moi.id);
  ok('capNhatIsTest(id, true) gắn is_test=1 đúng', sauKhiGan.is_test === 1);
  ok('Sau khi gắn, không còn trong layDeMatch()', (await store.layDeMatch()).length === 0);
  ok('Nhưng vẫn còn nguyên trong layTatCa() để debug', (await store.layTatCa()).length === 2);

  console.log(`\n=== Ket qua: ${pass} dat, ${fail} hong ===`);
  try { fs.unlinkSync(DB_TAM); } catch {}
  process.exit(fail > 0 ? 1 : 0);
})();
