// xem.js — Xem dữ liệu trong DB ngay trên cửa sổ lệnh, không cần mở web.
//
//   node xem.js                 -> liệt kê mọi chuyến (mã, vai trò, tên, tuyến, giờ)
//   node xem.js ABCD1234        -> chi tiết 1 chuyến + những ai ghép được với nó
//   node xem.js --cap           -> liệt kê MỌI cặp khớp trong DB
//   node xem.js --tim "Bình"    -> tìm chuyến theo tên hoặc số điện thoại
//
// Muốn xem DB mẫu thay vì DB thật, đặt biến SYB_DB trước khi chạy:
//   PowerShell:  $env:SYB_DB="shareyourbike_50mau.db"; node xem.js
//   CMD:         set SYB_DB=shareyourbike_50mau.db && node xem.js

const { layTatCa, layTheoMa } = require('./db.js');
const { xetCap, danhGiaCap } = require('./match.js');

const VAI = { driver: 'CÓ XE   ', rider: 'ĐI NHỜ  ' };
const TEN_NGAY = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };
const ngay = (d) => String(d).split(',').map((n) => TEN_NGAY[n.trim()] || n).join(' ');
const tien = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

function motDong(t) {
  return `${t.code}  ${VAI[t.role]}  ${t.name.padEnd(22)} ${t.phone}  ${t.pickup}-${t.dropoff || '??:??'}  ` +
    `${t.start_label}  ->  ${t.end_label}`;
}

function chiTiet(t) {
  console.log(`\nMã chuyến : ${t.code}`);
  console.log(`Vai trò   : ${t.role === 'driver' ? 'Người CÓ XE' : 'Người CẦN ĐI NHỜ'}`);
  console.log(`Người     : ${t.name} — ${t.phone}${t.email ? ' — ' + t.email : ''}`);
  console.log(`Điểm đi   : ${t.start_label}  (${t.start_lat}, ${t.start_lon})`);
  console.log(`Điểm đến  : ${t.end_label}  (${t.end_lat}, ${t.end_lon})`);
  console.log(`Giờ       : đón ${t.pickup}, tới nơi ${t.dropoff || '(chưa khai)'}`);
  console.log(`Ngày đi   : ${ngay(t.days)}`);
  console.log(`Xe        : ${t.role === 'driver'
    ? `${t.vehicle_type === 'car' ? 'Xe hơi' : 'Xe máy'}${t.vehicle_model ? ' — ' + t.vehicle_model : ''}`
    : `mong muốn ${{ any: 'bất kỳ', bike: 'xe máy', car: 'xe hơi' }[t.want_type || 'any']}`}`);
  console.log(`Giá       : ${tien(t.price)}`);
}

async function xemMot(ma) {
  const t = await layTheoMa(ma.toUpperCase());
  if (!t) return console.log(`Không có chuyến nào mang mã "${ma}".`);
  chiTiet(t);

  const khac = (await layTatCa()).filter((x) => x.id !== t.id);
  const khop = khac
    .map((o) => ({ o, kq: xetCap(t, o) }))
    .filter((x) => x.kq.khop)
    .sort((a, b) => a.kq.diem - b.kq.diem);

  console.log(`\n--- GHÉP ĐƯỢC: ${khop.length} người ---`);
  khop.forEach(({ o, kq }) => {
    console.log(`  ${o.code}  ${o.name.padEnd(22)} ${o.pickup}  lệch ${kq.lechPhut}p  ` +
      `đầu ${kq.kmDau.toFixed(2)}km  cuối ${kq.kmCuoi.toFixed(2)}km  [${kq.cachKhop}]  ngày chung ${kq.tenNgay}`);
    console.log(`      ${o.start_label} -> ${o.end_label}`);
  });

  // Vì sao những người còn lại KHÔNG ghép được — chỉ hiện người ngược vai và trượt ít tiêu chí nhất
  const gan = khac
    .map((o) => ({ o, d: danhGiaCap(t, o) }))
    .filter((x) => x.d.nguocVai && x.d.truot.length > 0)
    .sort((a, b) => a.d.truot.length - b.d.truot.length)
    .slice(0, 5);
  if (gan.length) {
    console.log(`\n--- GẦN NHẤT nhưng chưa ghép được (5 người) ---`);
    gan.forEach(({ o, d }) => {
      console.log(`  ${o.code}  ${o.name.padEnd(22)} vướng: ${d.truot.map((x) => x.moTa).join('; ')}`);
    });
  }
}

async function xemCap() {
  const t = await layTatCa();
  const cap = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const kq = xetCap(t[i], t[j]);
      if (kq.khop) cap.push({ a: t[i], b: t[j], kq });
    }
  }
  cap.sort((x, y) => x.kq.diem - y.kq.diem);
  console.log(`${cap.length} cặp khớp trong ${t.length} chuyến:\n`);
  cap.forEach(({ a, b, kq }, i) => {
    const tx = a.role === 'driver' ? a : b;
    const kh = a.role === 'driver' ? b : a;
    console.log(`${String(i + 1).padStart(2)}. ${tx.name} (${tx.code}, có xe)  +  ${kh.name} (${kh.code}, đi nhờ)`);
    console.log(`    ${tx.start_label} -> ${tx.end_label}   ${tx.pickup}`);
    console.log(`    ${kh.start_label} -> ${kh.end_label}   ${kh.pickup}`);
    console.log(`    đầu ${kq.kmDau.toFixed(2)}km · cuối ${kq.kmCuoi.toFixed(2)}km · lệch ${kq.lechPhut} phút · ${kq.tenNgay} · khớp nhờ ${kq.cachKhop}\n`);
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    const t = await layTatCa();
    console.log(`${t.length} chuyến trong DB (${t.filter((x) => x.role === 'driver').length} có xe, ` +
      `${t.filter((x) => x.role === 'rider').length} cần đi nhờ):\n`);
    t.forEach((x) => console.log(motDong(x)));
    console.log('\nXem chi tiết 1 chuyến:  node xem.js <MÃ>        Xem mọi cặp khớp:  node xem.js --cap');
    return;
  }
  if (arg === '--cap') return xemCap();
  if (arg === '--tim') {
    const tu = (process.argv[3] || '').toLowerCase();
    const t = (await layTatCa()).filter((x) => x.name.toLowerCase().includes(tu) || x.phone.includes(tu));
    console.log(`Tìm "${tu}": ${t.length} kết quả\n`);
    t.forEach((x) => console.log(motDong(x)));
    return;
  }
  await xemMot(arg);
}

main().catch((e) => { console.error(e); process.exit(1); });
