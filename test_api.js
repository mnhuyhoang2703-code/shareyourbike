// test_api.js — Chạy: node test_api.js
// Test đầu-cuối phần đăng chuyến / match / lộ SĐT, KHÔNG cần mạng.
// Dùng file DB riêng nên không đụng dữ liệu thật.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DB_TAM = path.join(os.tmpdir(), `syb_test_${Date.now()}.db`);
process.env.SYB_DB = DB_TAM;
process.env.PORT = '3999';

const BASE = 'http://localhost:3999';
let pass = 0, fail = 0;
function ok(ten, dieuKien) {
  console.log(`${dieuKien ? 'DAT ' : 'HONG'} | ${ten}`);
  dieuKien ? pass++ : fail++;
}

// Sổ tay: mã -> {name, phone} đã dùng khi đăng, để tự đính kèm khi XEM.
// Từ 22/07/2026 endpoint xem yêu cầu khớp mã + tên + sđt.
const DANH_BA = new Map();

const post = (p, body) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json();
    if (p === '/api/trips' && data.code) {
      DANH_BA.set(data.code, { name: body.name, phone: body.phone });
    }
    return { status: r.status, data };
  });

// Với đường xem chuyến, tự gắn name+phone từ sổ tay (nếu có mã trong sổ).
function themDangNhap(p) {
  const m = p.match(/^\/api\/trips\/([^/?]+)$/);
  if (!m) return p;
  const info = DANH_BA.get(decodeURIComponent(m[1]).toUpperCase());
  if (!info) return p; // mã không tồn tại -> để server trả 404 như cũ
  const q = '?name=' + encodeURIComponent(info.name) + '&phone=' + encodeURIComponent(info.phone);
  return p + q;
}

const get = (p) => fetch(BASE + themDangNhap(p)).then(async (r) => ({ status: r.status, data: await r.json() }));

// Mốc thật ở TPHCM
const BEN_THANH = [10.7725, 106.6980];
const DUC_BA    = [10.7797, 106.6990]; // cach Ben Thanh 0.8km
const LANDMARK  = [10.7951, 106.7218]; // cach Ben Thanh 3.6km
const THU_DUC   = [10.8700, 106.8030];

const mau = (o = {}) => ({
  role: 'driver', name: 'Nguyen Van A', phone: '0901234567', vehicle_type: 'bike',
  start_label: 'Cho Ben Thanh', start_lat: BEN_THANH[0], start_lon: BEN_THANH[1],
  end_label: 'Thu Duc', end_lat: THU_DUC[0], end_lon: THU_DUC[1],
  pickup: '07:00', dropoff: '07:45', days: '2,3,4,5,6', price: 30000, ...o,
});

(async () => {
  // server.js chỉ tự listen khi chạy trực tiếp; khi require thì ta tự bật.
  const { server } = require('./server.js');
  await new Promise((resolve) => server.listen(Number(process.env.PORT), resolve));

  console.log('--- Kiem tra du lieu dau vao ---');
  ok('Thieu ten => tu choi', (await post('/api/trips', mau({ name: '' }))).status === 400);
  ok('SDT sai dinh dang => tu choi', (await post('/api/trips', mau({ phone: '123' }))).status === 400);
  ok('Email sai => tu choi', (await post('/api/trips', mau({ email: 'abc' }))).status === 400);
  ok('Gio don sai => tu choi', (await post('/api/trips', mau({ pickup: '25:99' }))).status === 400);
  ok('Gio toi noi truoc gio don => tu choi',
    (await post('/api/trips', mau({ pickup: '08:00', dropoff: '07:00' }))).status === 400);
  ok('Khong chon ngay nao => tu choi', (await post('/api/trips', mau({ days: '' }))).status === 400);
  ok('Toa do ngoai TPHCM (Ha Noi) => tu choi',
    (await post('/api/trips', mau({ start_lat: 21.0285, start_lon: 105.8542 }))).status === 400);
  ok('Gia am => tu choi', (await post('/api/trips', mau({ price: -5 }))).status === 400);
  ok('Toa do dang chuoi thay vi so => tu choi',
    (await post('/api/trips', mau({ start_lat: '10.77' }))).status === 400);

  console.log('\n--- Tao chuyen ---');
  const taiXe = (await post('/api/trips', mau({ name: 'Tai Xe A', phone: '0901111111' }))).data;
  ok('Tao chuyen tai xe => co ma 6 ky tu', typeof taiXe.code === 'string' && taiXe.code.length === 6);

  const khach = (await post('/api/trips', mau({
    role: 'rider', name: 'Khach B', phone: '0902222222',
    start_lat: DUC_BA[0], start_lon: DUC_BA[1], start_label: 'Nha tho Duc Ba',
    pickup: '07:10', days: '2,3,4', price: 25000,
  }))).data;
  ok('Tao chuyen khach => co ma', typeof khach.code === 'string');
  ok('Hai ma khac nhau', taiXe.code !== khach.code);

  const xaTit = (await post('/api/trips', mau({
    role: 'rider', name: 'Khach Xa', phone: '0903333333',
    start_lat: LANDMARK[0], start_lon: LANDMARK[1], start_label: 'Landmark',
  }))).data;

  console.log('\n--- Xem match ---');
  const xemTaiXe = (await get('/api/trips/' + taiXe.code)).data;
  ok('Tai xe thay dung 1 match', xemTaiXe.matches.length === 1);
  ok('Match do la Khach B', xemTaiXe.matches[0].name === 'Khach B');
  ok('Khach o Landmark (3.6km) KHONG hien', !xemTaiXe.matches.some((m) => m.name === 'Khach Xa'));
  ok('Co hien khoang cach diem dau', xemTaiXe.matches[0].kmDau > 0.7 && xemTaiXe.matches[0].kmDau < 0.9);
  ok('Co hien gia cua doi phuong', xemTaiXe.matches[0].price === 25000);
  ok('Co hien ngay trung nhau', xemTaiXe.matches[0].ngayChung === 'T2, T3, T4');
  ok('Tai xe van xem duoc SDT cua CHINH MINH', xemTaiXe.me.phone === '0901111111');

  console.log('\n--- QUAN TRONG: khong duoc lo SDT khi chua match hai chieu ---');
  const m0 = xemTaiXe.matches[0];
  ok('Chua ai bam quan tam => lienHe = null', m0.lienHe === null);
  ok('Khong co truong phone trong match', m0.phone === undefined);
  ok('Khong co truong email trong match', m0.email === undefined);
  ok('Khong lo ma code cua nguoi khac', m0.code === undefined);
  const rawJson = JSON.stringify(xemTaiXe.matches);
  ok('SDT khach KHONG xuat hien o bat ky dau trong JSON', !rawJson.includes('0902222222'));

  console.log('\n--- Mot chieu roi hai chieu ---');
  const b1 = await post('/api/interest', { code: taiXe.code, targetId: m0.id });
  ok('Tai xe bam quan tam => chua hai chieu', b1.data.haiChieu === false);
  ok('Mot chieu van chua lo SDT', b1.data.lienHe === null);

  const xemKhach1 = (await get('/api/trips/' + khach.code)).data;
  ok('Khach thay "ho quan tam minh"', xemKhach1.matches[0].hoQuanTam === true);
  ok('Nhung van chua lo SDT tai xe',
    xemKhach1.matches[0].lienHe === null &&
    !JSON.stringify(xemKhach1.matches).includes('0901111111'));

  const b2 = await post('/api/interest', { code: khach.code, targetId: xemKhach1.matches[0].id });
  ok('Khach bam lai => HAI CHIEU', b2.data.haiChieu === true);
  ok('Luc nay moi lo SDT', b2.data.lienHe.phone === '0901111111');

  const xemTaiXe2 = (await get('/api/trips/' + taiXe.code)).data;
  ok('Tai xe cung thay SDT khach', xemTaiXe2.matches[0].lienHe.phone === '0902222222');
  ok('Co danh dau haiChieu', xemTaiXe2.matches[0].haiChieu === true);

  console.log('\n--- Chong pha hoai ---');
  ok('Ma sai => 404', (await get('/api/trips/KHONGCO1')).status === 404);

  console.log('\n--- Dang nhap xem: khop ma + sdt (bo xac thuc ten 23/07/2026) ---');
  const xemRaw = (code, phone) => {
    let q = '';
    if (phone != null) q += '?phone=' + encodeURIComponent(phone);
    return fetch(BASE + '/api/trips/' + code + q).then((r) => r.status);
  };
  ok('Ma + sdt dung => 200', (await xemRaw(taiXe.code, '0901111111')) === 200);
  ok('SDT co khoang trang/dau cham van khop => 200',
    (await xemRaw(taiXe.code, '090 111 1111')) === 200);
  ok('Ten khong con anh huong (bo qua) => van 200',
    (await fetch(BASE + '/api/trips/' + taiXe.code + '?name=Nguoi+La&phone=0901111111').then((r) => r.status)) === 200);
  ok('Sai sdt => 403', (await xemRaw(taiXe.code, '0900000000')) === 403);
  ok('Thieu sdt => 403', (await xemRaw(taiXe.code, null)) === 403);
  ok('Quan tam bang ma sai => 404',
    (await post('/api/interest', { code: 'SAIBET12', targetId: m0.id })).status === 404);
  ok('Do id bua (chuyen khong khop) => tu choi',
    (await post('/api/interest', { code: taiXe.code, targetId: 99999 })).status === 404);
  const doXaTit = await post('/api/interest', { code: taiXe.code, targetId: 3 });
  ok('Quan tam chuyen KHONG khop (Landmark) => tu choi', doXaTit.status === 400);
  ok('Tu quan tam chinh minh => tu choi',
    (await post('/api/interest', { code: taiXe.code, targetId: xemTaiXe.me.id })).status === 400);

  console.log('\n--- Ma khong phan biet hoa thuong ---');
  ok('Nhap ma chu thuong van tim ra', (await get('/api/trips/' + taiXe.code.toLowerCase())).status === 200);

  console.log('\n--- Loai xe ---');
  ok('Tai xe khong khai loai xe => tu choi',
    (await post('/api/trips', mau({ vehicle_type: null }))).status === 400);
  ok('Loai xe la bay => tu choi',
    (await post('/api/trips', mau({ vehicle_type: 'may bay' }))).status === 400);
  ok('Mong muon khong hop le => tu choi',
    (await post('/api/trips', mau({ role: 'rider', vehicle_type: null, want_type: 'truc thang' }))).status === 400);
  ok('Nguoi di nho KHONG can khai loai xe => chap nhan',
    (await post('/api/trips', mau({ role: 'rider', vehicle_type: null, phone: '0904444444' }))).status === 200);

  // Tai xe xe hoi, cung tuyen voi khach B
  const xeHoi = (await post('/api/trips', mau({
    name: 'Tai Xe Xe Hoi', phone: '0905555555',
    vehicle_type: 'car', vehicle_model: 'Toyota Innova',
    start_lat: DUC_BA[0], start_lon: DUC_BA[1], start_label: 'Duc Ba', pickup: '07:05',
  }))).data;
  ok('Tao chuyen xe hoi OK', typeof xeHoi.code === 'string');

  const xemXeHoi = (await get('/api/trips/' + xeHoi.code)).data;
  ok('Chuyen cua minh co hien loai xe', xemXeHoi.me.tenLoaiXe === 'Xe hơi');
  ok('Chuyen cua minh co hien ten xe', xemXeHoi.me.vehicle_model === 'Toyota Innova');

  const xemKhachB = (await get('/api/trips/' + khach.code)).data;
  const thayXeHoi = xemKhachB.matches.find((m) => m.name === 'Tai Xe Xe Hoi');
  ok('Khach thay duoc loai xe cua tai xe', thayXeHoi && thayXeHoi.tenLoaiXe === 'Xe hơi');
  ok('Khach thay duoc ten xe cu the', thayXeHoi && thayXeHoi.vehicle_model === 'Toyota Innova');
  ok('Khach B khong ken loai => khong bi danh dau lech', thayXeHoi && thayXeHoi.lechLoaiXe === false);

  // Khach muon xe hoi: phai thay CA HAI, xe hoi xep tren xe may
  const kenXeHoi = (await post('/api/trips', mau({
    role: 'rider', vehicle_type: null, want_type: 'car',
    name: 'Khach Ken Xe Hoi', phone: '0906666666',
    start_lat: DUC_BA[0], start_lon: DUC_BA[1], start_label: 'Duc Ba', pickup: '07:05',
  }))).data;
  const xemKen = (await get('/api/trips/' + kenXeHoi.code)).data;
  const tenTheoThuTu = xemKen.matches.map((m) => m.name);
  ok('Van thay ca xe may lan xe hoi (khong loc cung)', xemKen.matches.length >= 2);
  ok('Xe hoi xep TREN xe may', tenTheoThuTu[0] === 'Tai Xe Xe Hoi');
  ok('Xe may bi danh dau lech loai',
    xemKen.matches.filter((m) => m.name !== 'Tai Xe Xe Hoi').every((m) => m.lechLoaiXe === true));
  ok('Xe hoi khong bi danh dau lech',
    xemKen.matches.find((m) => m.name === 'Tai Xe Xe Hoi').lechLoaiXe === false);

  console.log('\n--- Toa do de ve cham tren ban do ---');
  const xemLaiTaiXe = (await get('/api/trips/' + taiXe.code)).data;
  // Tim DUNG Khach B theo ten, khong dua vao thu tu (thu tu doi khi them chuyen moi)
  const mDiem = xemLaiTaiXe.matches.find((m) => m.name === 'Khach B');
  ok('Tim thay Khach B trong danh sach', Boolean(mDiem));
  ok('Co gui toa do diem don/tra', mDiem.diem && Array.isArray(mDiem.diem.start));
  ok('Toa do da lam tron ~110m (3 chu so thap phan)',
    mDiem.diem.start.every((v) => {
      const phanLe = String(v).split('.')[1];
      return phanLe === undefined || phanLe.length <= 3;
    }));
  ok('Toa do lam tron KHAC toa do goc (khong lo vi tri chinh xac)',
    mDiem.diem.start[0] !== DUC_BA[0]);
  ok('Nhung van du gan de danh gia (lech < 150m)',
    Math.abs(mDiem.diem.start[0] - DUC_BA[0]) < 0.0015);

  // Kiem tra lo SDT phai dung nguoi CHUA match hai chieu.
  // Khach B da match hai chieu tu phan tren nen SDT hien ra la DUNG.
  const chuaMatch = xemLaiTaiXe.matches.find((m) => !m.haiChieu);
  ok('Co it nhat 1 nguoi chua match hai chieu de kiem tra', Boolean(chuaMatch));
  ok('Nguoi chua match: co toa do de ve cham', Boolean(chuaMatch.diem));
  ok('Nguoi chua match: VAN khong lo SDT', chuaMatch.lienHe === null && chuaMatch.phone === undefined);
  ok('=> Toa do de ve ban do KHONG keo theo viec lo lien he',
    Boolean(chuaMatch.diem) && chuaMatch.lienHe === null);

  console.log('\n--- Muc "Gan khop" ---');
  // Nguoi di dung tuyen tai xe nhung lech gio 60 phut => phai vao muc gan khop
  const lechGio = (await post('/api/trips', mau({
    role: 'rider', vehicle_type: null, name: 'Khach Lech Gio', phone: '0907777777',
    start_lat: DUC_BA[0], start_lon: DUC_BA[1], start_label: 'Duc Ba',
    pickup: '08:00', dropoff: null, // tai xe don 07:00 => lech 60 phut
  }))).data;

  const xemLechGio = (await get('/api/trips/' + lechGio.code)).data;
  ok('Co truong ganKhop trong ket qua', Array.isArray(xemLechGio.ganKhop));
  const gTaiXe = xemLechGio.ganKhop.find((g) => g.name === 'Tai Xe A');
  ok('Nguoi lech 60 phut hien o muc GAN KHOP', Boolean(gTaiXe));
  ok('Khong nam trong danh sach khop that',
    !xemLechGio.matches.some((m) => m.name === 'Tai Xe A'));
  ok('Co noi ro ly do', gTaiXe.lyDo.includes('60 phut') || gTaiXe.lyDo.includes('60 phút'));
  ok('Co goi y cach khac phuc', typeof gTaiXe.goiY === 'string' && gTaiXe.goiY.length > 10);

  console.log('\n--- QUAN TRONG: "Gan khop" khong duoc thanh lo hong ---');
  ok('Gan khop KHONG co SDT', gTaiXe.phone === undefined);
  ok('Gan khop KHONG co email', gTaiXe.email === undefined);
  ok('Gan khop KHONG co lienHe', gTaiXe.lienHe === undefined);
  ok('Gan khop KHONG lo ma code', gTaiXe.code === undefined);
  ok('SDT tai xe khong xuat hien o bat ky dau trong ganKhop',
    !JSON.stringify(xemLechGio.ganKhop).includes('0901111111'));
  ok('Toa do trong gan khop cung da lam tron',
    gTaiXe.diem.start.every((v) => {
      const le = String(v).split('.')[1];
      return le === undefined || le.length <= 3;
    }));
  const thuQuanTam = await post('/api/interest', { code: lechGio.code, targetId: gTaiXe.id });
  ok('KHONG the bam quan tam nguoi chi gan khop', thuQuanTam.status === 400);

  console.log('\n--- Gan khop chi nhan nguoi truot DUNG 1 tieu chi ---');
  // Truot ca vi tri LAN gio => khong duoc hien
  const truotNhieu = (await post('/api/trips', mau({
    role: 'rider', vehicle_type: null, name: 'Truot Nhieu Tieu Chi', phone: '0908888888',
    start_lat: LANDMARK[0], start_lon: LANDMARK[1], start_label: 'Landmark', // xa 3.6km
    pickup: '08:00', dropoff: null, // lech 60 phut
  }))).data;
  const xemTruotNhieu = (await get('/api/trips/' + truotNhieu.code)).data;
  ok('Truot 2 tieu chi => KHONG hien o gan khop',
    !xemTruotNhieu.ganKhop.some((g) => g.name === 'Tai Xe A'));

  console.log('\n--- Hang so dung chung: chi mot nguon duy nhat ---');
  const cfg = (await get('/api/config')).data;
  const { DON_GIA: donGiaGoc } = require('./match.js');
  ok('/api/config tra ve don gia', cfg.DON_GIA && typeof cfg.DON_GIA.bike === 'number');
  ok('Khop chinh xac voi DON_GIA trong match.js',
    cfg.DON_GIA.bike === donGiaGoc.bike && cfg.DON_GIA.car === donGiaGoc.car);
  ok('Xe may dang la 5.000d/km', cfg.DON_GIA.bike === 5000);
  ok('Xe hoi dang la 8.000d/km', cfg.DON_GIA.car === 8000);
  ok('Co tra ve nguong 2km', cfg.BAN_KINH_KM === 2);
  ok('Co tra ve dung sai 15 phut', cfg.DUNG_SAI_PHUT === 15);

  console.log('\n--- Khong tron truong giua hai vai tro ---');
  const xemRider = (await get('/api/trips/' + kenXeHoi.code)).data;
  ok('Rider khong bi luu vehicle_type', xemRider.me.vehicle_type === null);
  ok('Rider giu dung want_type', xemRider.me.want_type === 'car');
  ok('Driver luon co want_type = any', xemXeHoi.me.want_type === 'any');

  console.log('\n--- Dang "Ca hai" vai (driver + rider dung chung 1 ma) ---');
  const caHai = (await post('/api/trips', mau({
    role: 'both', name: 'Ca Hai Vai', phone: '0909990001',
    vehicle_type: 'bike', vehicle_model: 'Wave', want_type: 'car',
  }))).data;
  ok('Dang "ca hai" van tra ve 1 ma duy nhat', typeof caHai.code === 'string' && caHai.code.length > 0);

  const xemCaHai = (await get('/api/trips/' + caHai.code)).data;
  ok('Xem ket qua tra ve mang vaiTro 2 phan tu', Array.isArray(xemCaHai.vaiTro) && xemCaHai.vaiTro.length === 2);
  const vaiDriver = xemCaHai.vaiTro && xemCaHai.vaiTro.find((v) => v.me.role === 'driver');
  const vaiRider = xemCaHai.vaiTro && xemCaHai.vaiTro.find((v) => v.me.role === 'rider');
  ok('Co du ca hang driver lan rider', Boolean(vaiDriver) && Boolean(vaiRider));
  ok('Hang driver giu dung ten xe da khai', vaiDriver && vaiDriver.me.vehicle_model === 'Wave');
  ok('Hang rider giu dung mong muon da khai', vaiRider && vaiRider.me.want_type === 'car');
  ok('Ca 2 hang dung chung 1 tuyen di/den', vaiDriver && vaiRider
    && vaiDriver.me.start_label === vaiRider.me.start_label
    && vaiDriver.me.end_label === vaiRider.me.end_label);
  ok('Sai sdt van bi tu choi nhu binh thuong',
    (await fetch(BASE + '/api/trips/' + caHai.code + '?phone=0900000000')
      .then((r) => r.status)) === 403);

  // BUG da gap: hang driver va hang rider cua CUNG 1 nguoi (cung SDT) bi tu khop
  // voi nhau (khac id nen khong bi loc theo id). Phai loai theo SDT.
  ok('Hang RIDER cua "ca hai" KHONG tu khop voi chinh hang DRIVER cua no (cung sdt)',
    !vaiRider.matches.some((m) => m.name === 'Ca Hai Vai'));
  ok('Hang DRIVER cua "ca hai" KHONG tu khop voi chinh hang RIDER cua no (cung sdt)',
    !vaiDriver.matches.some((m) => m.name === 'Ca Hai Vai'));
  ok('Cung khong tu hien o muc "gan khop"',
    !vaiRider.ganKhop.some((g) => g.name === 'Ca Hai Vai')
    && !vaiDriver.ganKhop.some((g) => g.name === 'Ca Hai Vai'));
  const tuQuanTamChinhMinh = await post('/api/interest', {
    code: caHai.code, targetId: vaiDriver.me.id,
  });
  ok('Hang rider khong the bay to quan tam voi hang driver cua chinh minh -> 400',
    tuQuanTamChinhMinh.status === 400);

  // Nguoi rider khac khop voi hang DRIVER cua "ca hai"
  const riderKhopVoiCaHai = (await post('/api/trips', mau({
    role: 'rider', vehicle_type: null, name: 'Rider Khop Ca Hai', phone: '0909990002',
  }))).data;
  const dsMatchCuaRider = (await get('/api/trips/' + riderKhopVoiCaHai.code)).data;
  ok('Rider thuong thay hang DRIVER cua "ca hai" trong ket qua',
    dsMatchCuaRider.matches.some((m) => m.name === 'Ca Hai Vai' && m.role === 'driver'));
  const qtRiderToiCaHai = await post('/api/interest', {
    code: riderKhopVoiCaHai.code, targetId: vaiDriver.me.id,
  });
  ok('Rider thuong bay to quan tam toi hang driver cua "ca hai" -> OK', qtRiderToiCaHai.status === 200);

  // Nguoi driver khac khop voi hang RIDER cua "ca hai"
  const driverKhopVoiCaHai = (await post('/api/trips', mau({
    role: 'driver', vehicle_type: 'bike', name: 'Driver Khop Ca Hai', phone: '0909990003',
  }))).data;
  const dsMatchCuaDriver = (await get('/api/trips/' + driverKhopVoiCaHai.code)).data;
  ok('Driver thuong thay hang RIDER cua "ca hai" trong ket qua',
    dsMatchCuaDriver.matches.some((m) => m.name === 'Ca Hai Vai' && m.role === 'rider'));

  // "Ca hai" tu minh bay to quan tam voi driverKhopVoiCaHai (role='driver') -> server
  // PHAI tu dong chon hang RIDER cua "ca hai" (vai nguoc lai) de xet khop, chu khong
  // duoc lam nham sang hang driver cua chinh no (2 driver khong bao gio khop nhau).
  // Neu chon nham hang, timMatch se khong thay target -> tra ve 400.
  const qtCaHaiChonDungVai = await post('/api/interest', {
    code: caHai.code, targetId: dsMatchCuaDriver.me.id,
  });
  ok('"Ca hai" tu dong chon dung hang RIDER khi quan tam nguoc lai 1 driver (khong bi 400 do nham vai)',
    qtCaHaiChonDungVai.status === 200);

  console.log(`\n=== Ket qua: ${pass} dat, ${fail} hong ===`);
  try { fs.unlinkSync(DB_TAM); } catch {}
  process.exit(fail > 0 ? 1 : 0);
})();
