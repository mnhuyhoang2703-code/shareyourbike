// backfill_routes.js — Chạy: node backfill_routes.js
//
// Điền tuyến đường cho các chuyến của người CÓ XE đã đăng trước khi có tính năng
// này. Chạy lại nhiều lần vẫn an toàn: chuyến nào đã có tuyến thì bỏ qua.
//
// LƯU Ý: dừng server trước khi chạy, hoặc chạy khi server rảnh — cả hai cùng ghi
// vào một file SQLite.

const store = require('./db.js');
const { layTuyen, HOST } = require('./osrm.js');

(async () => {
  const canLam = await store.layChuyenThieuTuyen();

  if (canLam.length === 0) {
    console.log('Khong co chuyen nao thieu tuyen. Khong phai lam gi.');
    return;
  }

  console.log(`Tim thay ${canLam.length} chuyen thieu tuyen. May chu OSRM: ${HOST}`);
  console.log('(moi lan goi cach nhau ~1.2 giay de khong lam phien may chu demo)\n');

  let xong = 0, hong = 0;
  for (const t of canLam) {
    process.stdout.write(`  [${t.code}] ${t.name}: `);
    const tuyen = await layTuyen(t.start_lat, t.start_lon, t.end_lat, t.end_lon);
    if (tuyen) {
      await store.luuTuyen(t.id, tuyen.route, tuyen.km);
      console.log(`OK — ${tuyen.km} km, ${tuyen.route.length} diem`);
      xong++;
    } else {
      console.log('HONG — bo qua, chay lai sau');
      hong++;
    }
  }

  console.log(`\nXong: ${xong} thanh cong, ${hong} that bai.`);
  if (hong > 0) console.log('Chay lai lenh nay de thu lai cac chuyen that bai.');
})();
