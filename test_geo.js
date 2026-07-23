// test_geo.js — Chạy: node test_geo.js
// Kiểm chứng phần toán học của việc ghép chuyến bằng các mốc thật ở TPHCM.

const { haversineKm, pointToRouteKm, isInHCMC } = require('./public/geo.js');

let pass = 0, fail = 0;
function check(name, actual, expected, tolerance) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'DAT ' : 'HONG'} | ${name}: ${actual.toFixed(3)} (mong doi ~${expected})`);
  ok ? pass++ : fail++;
}
function checkBool(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'DAT ' : 'HONG'} | ${name}: ${actual}`);
  ok ? pass++ : fail++;
}

// Các mốc thật ở TPHCM
const BEN_THANH   = [10.7725, 106.6980];
const NHA_THO_DUC_BA = [10.7797, 106.6990];
const LANDMARK_81 = [10.7951, 106.7218];
const SAN_BAY_TSN = [10.8188, 106.6519];
const THU_DUC     = [10.8700, 106.8030];

console.log('--- Khoang cach giua cac moc (km) ---');
// Bến Thành -> Nhà thờ Đức Bà: khoảng 0.8km đường chim bay
check('Ben Thanh -> Nha tho Duc Ba', haversineKm(...BEN_THANH, ...NHA_THO_DUC_BA), 0.8, 0.2);
// Bến Thành -> Landmark 81: khoảng 3.6km
check('Ben Thanh -> Landmark 81', haversineKm(...BEN_THANH, ...LANDMARK_81), 3.6, 0.4);
// Bến Thành -> Tân Sơn Nhất: khoảng 7.0km
check('Ben Thanh -> San bay TSN', haversineKm(...BEN_THANH, ...SAN_BAY_TSN), 7.0, 0.6);
// Điểm trùng chính nó = 0
check('Cung mot diem', haversineKm(...BEN_THANH, ...BEN_THANH), 0, 0.0001);

console.log('\n--- Nguong 2km de ghep chuyen ---');
checkBool('Duc Ba trong ban kinh 2km cua Ben Thanh',
  haversineKm(...BEN_THANH, ...NHA_THO_DUC_BA) < 2, true);
checkBool('Landmark 81 KHONG trong ban kinh 2km cua Ben Thanh',
  haversineKm(...BEN_THANH, ...LANDMARK_81) < 2, false);

console.log('\n--- Diem co nam tren tuyen duong khong ---');
// Tuyến giả lập: Thủ Đức -> Landmark 81 -> Bến Thành
const tuyenTaiXe = [THU_DUC, LANDMARK_81, BEN_THANH];

// Nhà thờ Đức Bà nằm sát tuyến (gần đoạn Landmark 81 -> Bến Thành) => phải < 2km
const dDucBa = pointToRouteKm(...NHA_THO_DUC_BA, tuyenTaiXe);
check('Duc Ba toi tuyen', dDucBa, 0.5, 0.9);
checkBool('=> Duc Ba di nho duoc (< 2km)', dDucBa < 2, true);

// Sân bay TSN lệch hẳn khỏi tuyến => phải > 2km
const dSanBay = pointToRouteKm(...SAN_BAY_TSN, tuyenTaiXe);
checkBool('=> San bay TSN KHONG nam tren tuyen (> 2km)', dSanBay > 2, true);
console.log(`     (khoang cach thuc te toi tuyen: ${dSanBay.toFixed(2)} km)`);

// Điểm nằm ngay trên tuyến thì khoảng cách phải xấp xỉ 0
check('Landmark 81 (dinh cua tuyen) toi tuyen', pointToRouteKm(...LANDMARK_81, tuyenTaiXe), 0, 0.01);

console.log('\n--- Khung bao TPHCM ---');
checkBool('Ben Thanh trong TPHCM', isInHCMC(...BEN_THANH), true);
checkBool('Ha Noi KHONG trong TPHCM', isInHCMC(21.0285, 105.8542), false);
checkBool('Da Nang KHONG trong TPHCM', isInHCMC(16.0544, 108.2022), false);

console.log(`\n=== Ket qua: ${pass} dat, ${fail} hong ===`);
process.exit(fail > 0 ? 1 : 0);
