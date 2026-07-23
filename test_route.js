// test_route.js — Chạy: node test_route.js
// Kiểm chứng luật "diem ket thuc nam TREN TUYEN tai xe" bằng ĐÚNG hai chuyến
// thật Hoàng đã đăng (Tân Phú -> Cát Lái và Tân Phú -> An Khánh).
// KHÔNG gọi mạng: tuyến đường được bơm vào tay để test chạy được ở mọi nơi.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DB_TAM = path.join(os.tmpdir(), `syb_route_${Date.now()}.db`);
process.env.SYB_DB = DB_TAM;

const store = require('./db.js');
const { xetCap, timMatch } = require('./match.js');
const { haversineKm } = require('./geo.js');

let pass = 0, fail = 0;
function ok(ten, dieuKien) {
  console.log(`${dieuKien ? 'DAT ' : 'HONG'} | ${ten}`);
  dieuKien ? pass++ : fail++;
}

// Toa do THAT lay tu DB cua Hoang
const TAN_PHU_A = [10.7744779, 106.6351486]; // 30 Trinh Dinh Thao
const TAN_PHU_B = [10.774275, 106.6369338];  // WinMart+ 68 Trinh Dinh Thao
const CAT_LAI   = [10.7741861, 106.7572446]; // Truong Van Bang
const AN_KHANH  = [10.7763062, 106.7135084]; // Khu pho 27

const taiXe = store.taoChuyen({
  role: 'driver', name: 'Mai Hoang', phone: '0937583273',
  start_label: 'Trinh Dinh Thao', start_lat: TAN_PHU_A[0], start_lon: TAN_PHU_A[1],
  end_label: 'Cat Lai', end_lat: CAT_LAI[0], end_lon: CAT_LAI[1],
  pickup: '07:30', days: '2,3,4,5,6', price: 67000, vehicle_type: 'bike', vehicle_model: 'Wave',
});

const khach = store.taoChuyen({
  role: 'rider', name: 'Mai Ha', phone: '0914188608',
  start_label: 'WinMart+', start_lat: TAN_PHU_B[0], start_lon: TAN_PHU_B[1],
  end_label: 'An Khanh', end_lat: AN_KHANH[0], end_lon: AN_KHANH[1],
  pickup: '07:30', days: '2,3,4,5,6', price: 42000,
});

console.log('--- Tinh hinh hai chuyen ---');
const kmDau = haversineKm(...TAN_PHU_A, ...TAN_PHU_B);
const kmCuoi = haversineKm(...CAT_LAI, ...AN_KHANH);
console.log(`  Diem khoi hanh cach nhau: ${kmDau.toFixed(2)} km`);
console.log(`  Diem ket thuc cach nhau : ${kmCuoi.toFixed(2)} km`);
ok('Diem khoi hanh rat gan (< 2km)', kmDau < 2);
ok('Diem ket thuc XA nhau (> 2km)', kmCuoi > 2);

console.log('\n--- CHUA co tuyen duong ---');
// Chuyen nay dai 13.3km chim bay => la "chuyen dai" => luat HANH LANG 1.5km
// van cuu duoc, khong can OSRM. Day chinh la luoi an toan Hoang de xuat.
const truoc = xetCap(store.layTheoMa(taiXe.code), store.layTheoMa(khach.code));
ok('=> VAN KHOP nho hanh lang chim bay (khong can OSRM)', truoc.khop === true);
ok('   ghi nhan dung cach khop', truoc.cachKhop === 'hanh-lang');
console.log(`     khach cach hanh lang: ${truoc.kmToiHanhLang.toFixed(2)} km`);

console.log('\n--- SAU khi co tuyen duong ---');
// Tuyến giả lập chạy dọc theo hướng đông, đi ngang qua An Khánh — giống hệt
// hình dạng tuyến thật Tân Phú -> Cát Lái mà OSRM sẽ trả về.
const tuyenGia = [
  TAN_PHU_A,
  [10.7750, 106.6600],
  [10.7755, 106.6900],
  [10.7760, 106.7130], // ngay canh An Khanh
  [10.7750, 106.7350],
  CAT_LAI,
];
store.luuTuyen(taiXe.id, tuyenGia, 14.2);

const xeCoTuyen = store.layTheoMa(taiXe.code);
ok('Tuyen doc ra tu DB la MANG (khong phai chuoi)', Array.isArray(xeCoTuyen.route));
ok('Tuyen giu du so diem', xeCoTuyen.route.length === tuyenGia.length);
ok('Quang duong that duoc luu', xeCoTuyen.route_km === 14.2);

const sau = xetCap(xeCoTuyen, store.layTheoMa(khach.code));
ok('=> BAY GIO KHOP', sau.khop === true);
ok('  vi diem den nam sat tuyen', sau.kmToiTuyen !== null && sau.kmToiTuyen < 2);
console.log(`     diem den cach tuyen: ${sau.kmToiTuyen.toFixed(2)} km`);

console.log('\n--- Diem den THAT SU xa tuyen thi van phai truot ---');
const khachXa = store.taoChuyen({
  role: 'rider', name: 'Khach Di Huong Khac', phone: '0911111111',
  start_label: 'WinMart+', start_lat: TAN_PHU_B[0], start_lon: TAN_PHU_B[1],
  // Nha Be — lech han xuong phia nam, khong nam tren tuyen di dong
  end_label: 'Nha Be', end_lat: 10.6950, end_lon: 106.7050,
  pickup: '07:30', days: '2,3,4,5,6', price: 40000,
});
const kqXa = xetCap(xeCoTuyen, store.layTheoMa(khachXa.code));
ok('Khach di huong khac => van TRUOT', kqXa.khop === false);

console.log('\n--- Du lieu tuyen hong thi khong duoc lam sap ---');
store.db.prepare('UPDATE trips SET route = ? WHERE id = ?').run('{khong-phai-json', taiXe.id);
const xeHong = store.layTheoMa(taiXe.code);
ok('JSON hong => route ve null, khong nem loi', xeHong.route === null);
// Tuyen hong thi khong duoc dung luat "tren tuyen" nua, nhung hanh lang van cuu
const kqHong = xetCap(xeHong, store.layTheoMa(khach.code));
ok('Khong dung luat tren-tuyen voi du lieu hong', kqHong.cachKhop !== 'tren-tuyen');
ok('Nhung hanh lang van cuu duoc => khong mat match oan', kqHong.khop === true);

store.db.prepare('UPDATE trips SET route = ? WHERE id = ?').run('[[1,2]]', taiXe.id);
ok('Tuyen chi co 1 diem => coi nhu khong co', store.layTheoMa(taiXe.code).route === null);

console.log('\n--- Danh sach chuyen thieu tuyen ---');
store.db.prepare('UPDATE trips SET route = NULL WHERE id = ?').run(taiXe.id);
const thieu = store.layChuyenThieuTuyen();
ok('Chi liet ke nguoi CO XE', thieu.every((t) => t.role === 'driver'));
ok('Tim ra dung chuyen thieu', thieu.some((t) => t.code === taiXe.code));
store.luuTuyen(taiXe.id, tuyenGia, 14.2);
ok('Dien tuyen xong thi khong con trong danh sach thieu',
  !store.layChuyenThieuTuyen().some((t) => t.code === taiXe.code));

console.log('\n--- timMatch tra ve dung ket qua ---');
const dsMatch = timMatch(store.layTheoMa(khach.code), store.layTatCa());
ok('Khach tim thay tai xe', dsMatch.some((m) => m.trip.code === taiXe.code));

// ================== LUAT HANH LANG CHIM BAY (chuyen > 5km) ==================
console.log('\n--- Luat hanh lang chim bay 1.5km cho chuyen DAI ---');
const { RULES } = require('./match.js');
ok('Nguong chuyen dai = 5km', RULES.CHUYEN_DAI_KM === 5);
ok('Hanh lang = 1.5km', RULES.HANH_LANG_KM === 1.5);

// Chuyen tai xe Tan Phu -> Cat Lai dai ~13.3km chim bay => LA chuyen dai.
// Xoa tuyen OSRM di de chi con luat hanh lang.
store.db.prepare('UPDATE trips SET route = NULL WHERE id = ?').run(taiXe.id);
const xeKhongTuyen = store.layTheoMa(taiXe.code);
ok('Da xoa tuyen', xeKhongTuyen.route === null);

const kqHanhLang = xetCap(xeKhongTuyen, store.layTheoMa(khach.code));
ok('Chuyen DAI + khach nam trong hanh lang => VAN KHOP du khong co OSRM',
  kqHanhLang.khop === true);
ok('  ghi nhan khop nho hanh lang', kqHanhLang.cachKhop === 'hanh-lang');
console.log(`     do dai chuyen: ${kqHanhLang.doDaiChuyen.toFixed(1)} km, ` +
            `khach cach hanh lang: ${kqHanhLang.kmToiHanhLang.toFixed(2)} km`);

// Khach di huong khac van phai truot du la chuyen dai
ok('Khach di huong khac => van TRUOT',
  xetCap(xeKhongTuyen, store.layTheoMa(khachXa.code)).khop === false);

console.log('\n--- Chuyen NGAN thi KHONG duoc ap dung hanh lang ---');
// Chuyen ngan ~2km: Tan Phu -> mot diem gan do
const xeNgan = store.taoChuyen({
  role: 'driver', name: 'Tai Xe Chuyen Ngan', phone: '0922222222',
  start_label: 'Trinh Dinh Thao', start_lat: TAN_PHU_A[0], start_lon: TAN_PHU_A[1],
  end_label: 'Gan do', end_lat: 10.7750, end_lon: 106.6550, // ~2.2km
  pickup: '07:30', days: '2,3,4,5,6', price: 15000, vehicle_type: 'bike',
});
const xeNganDoc = store.layTheoMa(xeNgan.code);
const kqNgan = xetCap(xeNganDoc, store.layTheoMa(khach.code));
ok('Chuyen ngan (< 5km) => KHONG ap dung hanh lang, van truot', kqNgan.khop === false);
console.log(`     ly do: ${kqNgan.lyDo}`);

console.log('\n--- Tuyen that duoc uu tien hon hanh lang khi xep hang ---');
store.luuTuyen(taiXe.id, tuyenGia, 14.2);
const kqTuyenLai = xetCap(store.layTheoMa(taiXe.code), store.layTheoMa(khach.code));
ok('Co tuyen thi ghi nhan la tren-tuyen chu khong phai hanh-lang',
  kqTuyenLai.cachKhop === 'tren-tuyen');
ok('Khop nho tuyen that co diem TOT HON khop nho hanh lang',
  kqTuyenLai.diem < kqHanhLang.diem);

console.log(`\n=== Ket qua: ${pass} dat, ${fail} hong ===`);
try { fs.unlinkSync(DB_TAM); } catch {}
process.exit(fail > 0 ? 1 : 0);
