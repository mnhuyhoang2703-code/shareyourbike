// test_match.js — Chạy: node test_match.js
// Kiểm chứng luật ghép chuyến bằng các tình huống thật ở TPHCM.

const { timMatch, xetCap } = require('./match.js');

let pass = 0, fail = 0;
function ok(ten, dieuKien) {
  console.log(`${dieuKien ? 'DAT ' : 'HONG'} | ${ten}`);
  dieuKien ? pass++ : fail++;
}

// Mốc thật
const BEN_THANH = [10.7725, 106.6980];
const DUC_BA    = [10.7797, 106.6990]; // cach Ben Thanh ~0.8km
const LANDMARK  = [10.7951, 106.7218]; // cach Ben Thanh ~3.6km
const THU_DUC   = [10.8700, 106.8030];
const TAN_BINH  = [10.8010, 106.6520];

function chuyen(id, role, start, end, pickup, days, extra = {}) {
  return {
    id, role, name: 'User ' + id,
    start_lat: start[0], start_lon: start[1],
    end_lat: end[0], end_lon: end[1],
    pickup, days, ...extra,
  };
}

// Tài xế đi Bến Thành -> Thủ Đức, 7h00, T2-T6
const taiXe = chuyen(1, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6');

console.log('--- Truong hop khop ---');
// Khách ở Đức Bà (0.8km) -> Thủ Đức, 7h10 (lech 10 phut), T2-T4
const khachTot = chuyen(2, 'rider', DUC_BA, THU_DUC, '07:10', '2,3,4');
ok('Gan ca 2 dau + lech 10 phut + trung ngay => KHOP', xetCap(taiXe, khachTot).khop);

console.log('\n--- Cac truong hop phai TRUOT ---');
const cungVai = chuyen(3, 'driver', DUC_BA, THU_DUC, '07:05', '2,3,4');
ok('Cung la tai xe => truot', xetCap(taiXe, cungVai).khop === false);

const dauXa = chuyen(4, 'rider', LANDMARK, THU_DUC, '07:05', '2,3,4');
ok('Diem khoi hanh cach 3.6km => truot', xetCap(taiXe, dauXa).khop === false);

const cuoiXa = chuyen(5, 'rider', DUC_BA, TAN_BINH, '07:05', '2,3,4');
ok('Diem ket thuc xa => truot', xetCap(taiXe, cuoiXa).khop === false);

const lechGio = chuyen(6, 'rider', DUC_BA, THU_DUC, '07:20', '2,3,4');
ok('Gio don lech 20 phut (> 15) => truot', xetCap(taiXe, lechGio).khop === false);

const bienGio = chuyen(7, 'rider', DUC_BA, THU_DUC, '07:15', '2,3,4');
ok('Gio don lech dung 15 phut => VAN KHOP (bien)', xetCap(taiXe, bienGio).khop === true);

const khacNgay = chuyen(8, 'rider', DUC_BA, THU_DUC, '07:05', '7,8');
ok('Chi di T7-CN, tai xe di T2-T6 => truot', xetCap(taiXe, khacNgay).khop === false);

const thieuGio = chuyen(9, 'rider', DUC_BA, THU_DUC, '', '2,3,4');
ok('Thieu gio don => truot, khong crash', xetCap(taiXe, thieuGio).khop === false);

console.log('\n--- Diem ket thuc nam TREN TUYEN tai xe ---');
// Tài xế có tuyến Bến Thành -> Landmark 81 -> Thủ Đức.
// Khách kết thúc ở Landmark 81: cach diem cuoi Thu Duc rat xa NHUNG nam tren tuyen.
const taiXeCoTuyen = chuyen(10, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6',
  { route: [BEN_THANH, LANDMARK, THU_DUC] });
const khachGiuaDuong = chuyen(11, 'rider', DUC_BA, LANDMARK, '07:05', '2,3,4');
const kqTuyen = xetCap(taiXeCoTuyen, khachGiuaDuong);
ok('Ket thuc giua duong nhung tren tuyen => KHOP', kqTuyen.khop === true);
ok('  (co ghi nhan khoang cach toi tuyen)', kqTuyen.khop && kqTuyen.kmToiTuyen < 0.1);

// Khong co tuyen: chuyen nay dai ~15.8km chim bay nen luat HANH LANG van cuu duoc.
const khongTuyen = xetCap(taiXe, khachGiuaDuong);
ok('Chuyen DAI khong co tuyen => van khop nho hanh lang', khongTuyen.khop === true);
ok('  va ghi nhan dung la khop nho hanh lang', khongTuyen.cachKhop === 'hanh-lang');

// Nhung voi chuyen NGAN thi khong co luoi an toan nao ca
const taiXeNgan = chuyen(12, 'driver', BEN_THANH, [10.7800, 106.7100], '07:00', '2,3,4,5,6');
ok('Chuyen NGAN khong co tuyen => TRUOT (khong ap dung hanh lang)',
  xetCap(taiXeNgan, chuyen(13, 'rider', DUC_BA, THU_DUC, '07:05', '2,3,4')).khop === false);

console.log('\n--- Xep hang ket qua ---');
const danhSach = [
  chuyen(20, 'rider', BEN_THANH, THU_DUC, '07:00', '2,3,4'), // trung khop nhat
  khachTot,                                                    // xa hon, lech gio hon
  dauXa,                                                       // truot
  cungVai,                                                     // truot
];
const kq = timMatch(taiXe, danhSach);
ok('Tra ve dung 2 ket qua khop', kq.length === 2);
ok('Ket qua khop nhat xep dau (id 20)', kq[0].trip.id === 20);
ok('Khong tu ghep voi chinh minh', timMatch(taiXe, [taiXe]).length === 0);

console.log('\n--- Doi xung: A ghep B thi B cung ghep A ---');
ok('Chieu nguoc lai cho ket qua giong nhau',
  xetCap(khachTot, taiXe).khop === xetCap(taiXe, khachTot).khop);

console.log('\n--- Loai xe: KHONG loc cung, chi anh huong thu tu ---');
const xeMay = chuyen(30, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6', { vehicle_type: 'bike', vehicle_model: 'Wave' });
const xeHoi = chuyen(31, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6', { vehicle_type: 'car', vehicle_model: 'Innova' });

const muonXeHoi = chuyen(32, 'rider', DUC_BA, THU_DUC, '07:05', '2,3,4', { want_type: 'car' });
ok('Muon xe hoi + tai xe di xe hoi => khop, khong lech',
  xetCap(xeHoi, muonXeHoi).khop === true && xetCap(xeHoi, muonXeHoi).lechLoaiXe === false);
const kqLech = xetCap(xeMay, muonXeHoi);
ok('Muon xe hoi + tai xe di xe may => VAN KHOP (khong loc cung)', kqLech.khop === true);
ok('  nhung bi danh dau lech loai xe', kqLech.lechLoaiXe === true);
ok('  va bi phat diem nang', kqLech.diem > 1000);

const khongKen = chuyen(33, 'rider', DUC_BA, THU_DUC, '07:05', '2,3,4', { want_type: 'any' });
ok('Khong ken loai xe => khong bao gio bi danh dau lech',
  xetCap(xeMay, khongKen).lechLoaiXe === false && xetCap(xeHoi, khongKen).lechLoaiXe === false);

const khongKhaiMongMuon = chuyen(34, 'rider', DUC_BA, THU_DUC, '07:05', '2,3,4');
ok('Rider cu (chua co truong want_type) => khong loi, khong lech',
  xetCap(xeMay, khongKhaiMongMuon).lechLoaiXe === false);
ok('Tai xe cu (chua khai loai xe) => khong bi danh dau lech',
  xetCap(taiXe, muonXeHoi).lechLoaiXe === false);

console.log('\n--- Dung loai xe phai xep TREN loai lech ---');
// Xe hoi o XA hon (Landmark, 3.6km => truot) nen dung xe gan hon de test thu tu:
const xeHoiXaHon = chuyen(35, 'driver', DUC_BA, THU_DUC, '07:05', '2,3,4,5,6', { vehicle_type: 'car' });
const xeMayGanHon = chuyen(36, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6', { vehicle_type: 'bike' });
const xepHang = timMatch(muonXeHoi, [xeMayGanHon, xeHoiXaHon]);
ok('Ca hai deu hien ra', xepHang.length === 2);
ok('Xe hoi (dung mong muon) xep TREN xe may du xa hon', xepHang[0].trip.id === 35);

console.log('\n--- Gia khuyen nghi (5k/km xe may, 8k/km xe hoi) ---');
const { giaKhuyenNghi, DON_GIA } = require('./match.js');
ok('Don gia xe may = 5.000d/km', DON_GIA.bike === 5000);
ok('Don gia xe hoi = 8.000d/km', DON_GIA.car === 8000);
ok('Xe may 4.4km => 22.000d', giaKhuyenNghi(4.4, 'bike') === 22000);
ok('Xe hoi 4.4km => 35.000d', giaKhuyenNghi(4.4, 'car') === 35000);
ok('Lam tron toi 1.000d', giaKhuyenNghi(4.44, 'bike') === 22000);
ok('Khong khai loai xe => tinh theo xe may', giaKhuyenNghi(10, undefined) === 50000);
ok('Quang duong 0 => 0d', giaKhuyenNghi(0, 'car') === 0);

console.log('\n--- Gan khop: truot dung 1 tieu chi va con cuu duoc ---');
const { xetGanKhop, timGanKhop, RULES: R } = require('./match.js');

const lech60 = chuyen(40, 'rider', DUC_BA, THU_DUC, '08:00', '2,3,4'); // taiXe don 07:00
const g1 = xetGanKhop(taiXe, lech60);
ok('Lech 60 phut => gan khop', g1.ganKhop === true);
ok('  dung ma tieu chi "gio"', g1.ma === 'gio');
ok('  co goi y cu the', g1.goiY.includes('60'));

const lech120 = chuyen(41, 'rider', DUC_BA, THU_DUC, '09:00', '2,3,4'); // lech 120 phut
ok('Lech 120 phut (> 90) => qua xa, KHONG hien', xetGanKhop(taiXe, lech120).ganKhop === false);

const khopHan = chuyen(42, 'rider', DUC_BA, THU_DUC, '07:05', '2,3,4');
ok('Khop han roi => khong phai gan khop', xetGanKhop(taiXe, khopHan).ganKhop === false);

const cungVaiGan = chuyen(43, 'driver', DUC_BA, THU_DUC, '08:00', '2,3,4');
ok('Cung vai tro => khong bao gio gan khop', xetGanKhop(taiXe, cungVaiGan).ganKhop === false);

// Truot 2 tieu chi: vua xa vua lech gio
const truotHai = chuyen(44, 'rider', LANDMARK, THU_DUC, '08:00', '2,3,4');
ok('Truot 2 tieu chi => khong hien', xetGanKhop(taiXe, truotHai).ganKhop === false);

// Chi lech ngay
const khacNgayThoi = chuyen(45, 'rider', DUC_BA, THU_DUC, '07:05', '7,8');
const g2 = xetGanKhop(taiXe, khacNgayThoi);
ok('Chi lech ngay => gan khop', g2.ganKhop === true && g2.ma === 'ngay');

// Chi lech diem dau, trong tam cuu
const lechDau = chuyen(46, 'rider', [10.7950, 106.7000], THU_DUC, '07:05', '2,3,4');
const g3 = xetGanKhop(taiXe, lechDau);
ok('Diem dau lech vua phai => gan khop', g3.ganKhop === true && g3.ma === 'diem-dau');

console.log('\n--- Xep hang gan khop: de khac phuc nhat len dau ---');
const dsGan = timGanKhop(taiXe, [lechDau, lech60, khacNgayThoi, khopHan, truotHai]);
ok('Chi lay nguoi gan khop', dsGan.length === 3);
ok('Lech gio (de sua nhat) xep dau', dsGan[0].trip.id === 40);
ok('Lech ngay xep cuoi', dsGan[dsGan.length - 1].trip.id === 45);
ok('Nguoi khop han khong lot vao', !dsGan.some((x) => x.trip.id === 42));
ok('Nguoi truot 2 tieu chi khong lot vao', !dsGan.some((x) => x.trip.id === 44));
ok('Bien do gio = 90 phut', R.GAN_PHUT === 90);
ok('Bien do vi tri = 4km', R.GAN_BAN_KINH_KM === 4);

console.log('\n--- DON GIUA DUONG (space-time) ---');
// Tai xe di quen: Ben Thanh -> Thu Duc qua Landmark, xuat phat 07:00, toi noi 08:00.
// Landmark nam khoang 1/4 tuyen => tai xe ngang qua Landmark khoang 07:14.
const taiXeQuen = chuyen(50, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6',
  { route: [BEN_THANH, LANDMARK, THU_DUC], dropoff: '08:00' });

// Khach dung o Landmark (cach diem xuat phat tai xe 3.6km > 2km => luat cu loai),
// muon duoc don ~07:15, han chot toi noi 08:30. Tai xe ngang qua dung luc => KHOP.
const khachGiua = chuyen(51, 'rider', LANDMARK, THU_DUC, '07:15', '2,3,4',
  { dropoff: '08:30' });
const kqGiua = xetCap(taiXeQuen, khachGiua);
ok('Don giua duong: khach tren tuyen, don dung luc => KHOP', kqGiua.khop === true);
ok('  ghi nhan dung cach khop "don-tuyen"', kqGiua.cachKhop === 'don-tuyen');
ok('  co gio tai xe toi don', Boolean(kqGiua.donGiuaDuong && kqGiua.donGiuaDuong.gioDon));
ok('  khach di bo ra diem don rat gan (<0.3km)',
  kqGiua.donGiuaDuong.kmToiDiemDon < 0.3);

// Doi xung: chieu nguoc lai cho ket qua giong nhau
ok('  doi xung (khach xet tai xe) cung KHOP',
  xetCap(khachGiua, taiXeQuen).khop === true);

// Lech gio don qua nhieu: tai xe ngang qua ~07:14 nhung khach muon 06:30 => TRUOT
const khachSomQua = chuyen(52, 'rider', LANDMARK, THU_DUC, '06:30', '2,3,4',
  { dropoff: '08:30' });
ok('Tai xe ngang qua khong dung gio khach muon => TRUOT',
  xetCap(taiXeQuen, khachSomQua).khop === false);

// Qua HAN CHOT: don dung gio nhung han chot toi noi 07:30 < gio toi that 08:00 => TRUOT
const khachHanGap = chuyen(53, 'rider', LANDMARK, THU_DUC, '07:15', '2,3,4',
  { dropoff: '07:30' });
ok('Toi noi tre hon han chot cua khach => TRUOT',
  xetCap(taiXeQuen, khachHanGap).khop === false);

// Nguoc chieu: khach di Thu Duc -> Landmark (nguoc huong tai xe) => TRUOT
const khachNguoc = chuyen(54, 'rider', THU_DUC, LANDMARK, '07:45', '2,3,4',
  { dropoff: '08:30' });
ok('Khach di nguoc chieu tuyen => TRUOT',
  xetCap(taiXeQuen, khachNguoc).khop === false);

// Khach xa tuyen (Tan Binh khong nam tren duong di) => TRUOT
const khachXaTuyen = chuyen(55, 'rider', TAN_BINH, THU_DUC, '07:15', '2,3,4',
  { dropoff: '08:30' });
ok('Khach khong bam tuyen tai xe => TRUOT',
  xetCap(taiXeQuen, khachXaTuyen).khop === false);

// GUARD quan trong: tai xe KHONG khai gio toi noi (dropoff) => khong dung timeline
// duoc => space-time TAT => khach o Landmark bi loai o diem-dau nhu luat cu.
const taiXeThieuDropoff = chuyen(56, 'driver', BEN_THANH, THU_DUC, '07:00', '2,3,4,5,6',
  { route: [BEN_THANH, LANDMARK, THU_DUC] });
ok('Tai xe thieu gio toi noi => space-time tat => TRUOT (khong pha luat cu)',
  xetCap(taiXeThieuDropoff, khachGiua).khop === false);

console.log(`\n=== Ket qua: ${pass} dat, ${fail} hong ===`);
process.exit(fail > 0 ? 1 : 0);
