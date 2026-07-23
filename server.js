// server.js — Không cần npm install. Chạy: node server.js
// Nhiệm vụ: phục vụ file tĩnh + làm cầu nối tới Nominatim (OpenStreetMap).
//
// Vì sao phải qua server mà không gọi thẳng từ trình duyệt:
//  1. Nominatim yêu cầu User-Agent định danh và tối đa 1 request/giây.
//     Gọi thẳng từ nhiều tab trình duyệt sẽ bị chặn IP.
//  2. Có chỗ để cache — địa chỉ trùng thì không gọi lại.
//  3. Sau này đổi sang Google Maps chỉ cần sửa file này, API key không lộ ra client.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { HCMC_BBOX, isInHCMC } = require('./public/geo.js');
const store = require('./db.js');
const { layTuyen } = require('./osrm.js');
const {
  timMatch, timGanKhop, gioSangPhut, tachNgay, TEN_NGAY, TEN_LOAI_XE, DON_GIA, RULES,
} = require('./match.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Nominatim bắt buộc có User-Agent thật. Đổi email khi chạy thật.
const USER_AGENT = 'ShareYourBike/0.1 (lien he: mnhuyhoang2703@gmail.com)';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

// ---- Cache + hàng đợi tôn trọng giới hạn 1 req/giây của Nominatim ----
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callNominatim(urlPath, params) {
  const url = new URL(NOMINATIM + urlPath);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = url.toString();

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  // Xếp hàng: đảm bảo 2 lần gọi cách nhau >= 1.1 giây
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'vi,en' },
  });
  if (!res.ok) throw new Error(`Nominatim tra ve ${res.status}`);
  const data = await res.json();
  cache.set(key, { at: Date.now(), data });
  return data;
}

// Rút gọn kết quả Nominatim về đúng thứ giao diện cần.
//
// QUAN TRỌNG (đo được khi test thật 21/07/2026): dữ liệu OSM cho TPHCM gán SAI
// cấp QUẬN — cả Chợ Bến Thành lẫn đường Lý Thường Kiệt đều bị ghi là "Thành phố
// Thủ Đức". Nhưng cấp PHƯỜNG thì ĐÚNG (Bến Thành, Diên Hồng, Bình Trưng đều khớp)
// và TỌA ĐỘ hoàn toàn chính xác.
// => Giữ tên địa điểm + số nhà + tên đường + PHƯỜNG. Bỏ hẳn cấp quận.
//    Không dùng a.city_district: đó chính là chỗ ghi sai.
function simplify(item) {
  const a = item.address || {};
  const name = (item.name || '').trim();
  const road = a.road || '';
  const street = [a.house_number, road].filter(Boolean).join(' ');
  const ward = (a.quarter || a.suburb || a.village || a.town || '').trim();

  // Tên đường chỉ thêm vào khi nó bổ sung thông tin so với tên địa điểm
  const streetAdds = Boolean(street) && Boolean(road) && !name.includes(road);

  const parts = [];
  if (name) parts.push(name);
  if (streetAdds) parts.push(street);
  if (parts.length === 0) parts.push(String(item.display_name).split(',')[0]);
  if (ward) parts.push(ward);

  return {
    label: parts.join(', ') + ', TP.HCM',
    short: name || parts[0],
    ward,
    street: streetAdds ? street : '',
    raw: item.display_name, // giữ bản gốc để đối chiếu khi cần
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  };
}

// Một con đường dài ở TPHCM bị OSM cắt thành nhiều đoạn, mỗi đoạn là 1 kết quả
// TRÙNG TÊN Y HỆT — người dùng không biết chọn cái nào. Gộp lại: mỗi nhãn chỉ
// giữ 1 kết quả (đoạn đầu, tức đoạn Nominatim cho là khớp nhất).
// Nhờ đã thêm phường vào nhãn, các đoạn ở phường khác nhau vẫn được giữ riêng.
function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });
}

// ---- Các endpoint ----
async function handleGeocode(q) {
  if (!q || q.trim().length < 3) return [];
  // Gợi ý thêm bối cảnh giúp Nominatim đoán đúng hơn với địa chỉ Việt Nam
  const hinted = /h(o|ồ) ch(i|í) minh|tphcm|hcm|sai ?g(o|ò)n/i.test(q)
    ? q
    : `${q}, Thành phố Hồ Chí Minh`;

  const data = await callNominatim('/search', {
    q: hinted,
    format: 'jsonv2',
    // Lấy dư rồi mới gộp trùng, để sau khi gộp vẫn còn đủ lựa chọn
    limit: '15',
    countrycodes: 'vn',
    addressdetails: '1',
    // viewbox theo thứ tự: lon_trai, lat_tren, lon_phai, lat_duoi
    viewbox: `${HCMC_BBOX.lonMin},${HCMC_BBOX.latMax},${HCMC_BBOX.lonMax},${HCMC_BBOX.latMin}`,
    bounded: '1',
  });
  return dedupe(data.map(simplify)).slice(0, 6);
}

async function handleReverse(lat, lon) {
  const data = await callNominatim('/reverse', {
    lat, lon, format: 'jsonv2', addressdetails: '1', zoom: '18',
  });
  if (!data || data.error) return null;
  return simplify(data);
}

// ---- Đăng chuyến / xem match ----

/** Đọc body JSON, chặn payload quá lớn. */
function docBody(req, gioiHan = 64 * 1024) {
  // Trên Vercel, runtime có thể ĐÃ parse sẵn body vào req.body — lúc đó stream đã
  // bị tiêu thụ, đọc lại sẽ treo. Ưu tiên dùng req.body nếu có.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return Promise.resolve(JSON.parse(req.body || '{}')); }
      catch { return Promise.reject(new Error('JSON khong hop le')); }
    }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > gioiHan) { reject(new Error('Du lieu qua lon')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('JSON khong hop le')); }
    });
    req.on('error', reject);
  });
}

/**
 * Kiểm tra dữ liệu đăng chuyến. Trả mảng lỗi rỗng nghĩa là hợp lệ.
 * Không tin bất cứ thứ gì từ client — kể cả tọa độ.
 */
function kiemTraChuyen(b) {
  const loi = [];
  if (b.role !== 'driver' && b.role !== 'rider') loi.push('Chưa chọn vai trò');
  if (!String(b.name || '').trim()) loi.push('Thiếu tên');
  // Số VN: 10 số bắt đầu bằng 0, cho phép khoảng trắng/dấu chấm khi nhập
  if (!/^0\d{9}$/.test(String(b.phone || '').replace(/[\s.\-]/g, ''))) {
    loi.push('Số điện thoại phải là 10 số bắt đầu bằng 0');
  }
  if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email).trim())) {
    loi.push('Email không hợp lệ');
  }
  for (const [ten, lat, lon] of [
    ['khởi hành', b.start_lat, b.start_lon],
    ['kết thúc', b.end_lat, b.end_lon],
  ]) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
      loi.push(`Chưa chọn điểm ${ten} trên bản đồ`);
    } else if (!isInHCMC(lat, lon)) {
      loi.push(`Điểm ${ten} nằm ngoài TPHCM`);
    }
  }
  if (gioSangPhut(b.pickup) === null) loi.push('Giờ đón sai định dạng (HH:MM)');
  if (b.dropoff && gioSangPhut(b.dropoff) === null) loi.push('Giờ tới nơi sai định dạng (HH:MM)');
  // Giờ tới nơi (nếu khai) phải sau giờ đón — với tài xế đây là mốc dựng timeline
  // ghép đón-giữa-đường; với khách đây là hạn chót tới nơi.
  const gpDon = gioSangPhut(b.pickup), gpToi = gioSangPhut(b.dropoff);
  if (gpDon !== null && gpToi !== null && gpToi <= gpDon) {
    loi.push('Giờ tới nơi phải sau giờ đón');
  }
  if (tachNgay(b.days).length === 0) loi.push('Chưa chọn ngày nào trong tuần');
  const gia = Number(b.price);
  if (!Number.isFinite(gia) || gia < 0 || gia > 10_000_000) loi.push('Giá không hợp lệ');

  // Người có xe bắt buộc khai loại phương tiện; tên xe cụ thể thì tùy chọn
  if (b.role === 'driver') {
    if (b.vehicle_type !== 'bike' && b.vehicle_type !== 'car') {
      loi.push('Chưa chọn loại xe (xe máy / xe hơi)');
    }
  }
  // Người đi nhờ khai mong muốn là tùy chọn, nhưng nếu khai thì phải hợp lệ
  if (b.role === 'rider' && b.want_type && !['any', 'bike', 'car'].includes(b.want_type)) {
    loi.push('Mong muốn loại xe không hợp lệ');
  }
  return loi;
}

/**
 * Phiên bản CÔNG KHAI của một chuyến — dùng khi hiện cho người khác xem.
 * TUYỆT ĐỐI không chứa phone, email, code. Chỉ hàm này được phép ra ngoài.
 */
function congKhai(t) {
  return {
    id: t.id,
    role: t.role,
    name: t.name,
    start_label: t.start_label,
    end_label: t.end_label,
    pickup: t.pickup,
    dropoff: t.dropoff,
    days: t.days,
    tenNgay: tachNgay(t.days).map((d) => TEN_NGAY[d]).join(', '),
    price: t.price,
    note: t.note,
    vehicle_type: t.vehicle_type,
    vehicle_model: t.vehicle_model,
    tenLoaiXe: t.vehicle_type ? TEN_LOAI_XE[t.vehicle_type] : null,
    want_type: t.want_type,
  };
}

async function handleTaoChuyen(req, res) {
  const b = await docBody(req);
  const loi = kiemTraChuyen(b);
  if (loi.length) return json(res, 400, { errors: loi });

  const t = await store.taoChuyen({
    ...b,
    name: String(b.name).trim(),
    phone: String(b.phone).replace(/[\s.\-]/g, ''),
    email: b.email ? String(b.email).trim() : null,
    days: tachNgay(b.days).join(','),
    price: Number(b.price),
    note: b.note ? String(b.note).slice(0, 300) : null,
    // Chỉ lưu trường đúng với vai trò, tránh dữ liệu rác kiểu rider mà có tên xe
    vehicle_type: b.role === 'driver' ? b.vehicle_type : null,
    vehicle_model: b.role === 'driver' && b.vehicle_model
      ? String(b.vehicle_model).trim().slice(0, 60) : null,
    want_type: b.role === 'rider' ? (b.want_type || 'any') : 'any',
  });

  // Chỉ người CÓ XE mới cần tuyến đường (dùng để xét khách xuống dọc đường).
  // Cố ý await ở đây thay vì chạy nền: đăng xong là xem match được ngay,
  // không rơi vào cảnh "vừa đăng thì chưa thấy ai, một lát sau mới thấy".
  if (t.role === 'driver') {
    const tuyen = await layTuyen(t.start_lat, t.start_lon, t.end_lat, t.end_lon);
    // Lấy được thì lưu; không lấy được vẫn cho qua — chuyến đã đăng thành công rồi.
    if (tuyen) await store.luuTuyen(t.id, tuyen.route, tuyen.km);
  }

  return json(res, 200, { code: t.code });
}

/**
 * Làm tròn toạ độ về ~110m. Dùng cho điểm của NGƯỜI KHÁC: đủ để vẽ chấm lên
 * bản đồ và đánh giá có nằm trên đường đi không, nhưng không chỉ ra đúng nhà.
 */
const lamTron = (x) => Math.round(x * 1000) / 1000;

/** Chuyến của tôi + danh sách match. SĐT chỉ hiện khi đã match hai chiều. */
// Chuẩn hoá để so khớp: tên bỏ khoảng trắng thừa + thường hoá; sđt chỉ giữ chữ số.
const chuanTen = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const chuanSdt = (s) => String(s || '').replace(/\D/g, '');

async function handleXemChuyen(res, code, name, phone) {
  const me = await store.layTheoMa(String(code || '').trim().toUpperCase());
  if (!me) return json(res, 404, { error: 'Không tìm thấy mã này' });

  // Đăng nhập cần khớp cả 3: mã + tên + số điện thoại (chốt với Hoàng 22/07/2026).
  // Không nói rõ trường nào sai để tránh dò thông tin của người khác.
  if (chuanTen(name) !== chuanTen(me.name) || chuanSdt(phone) !== chuanSdt(me.phone)) {
    return json(res, 403, { error: 'Mã, tên hoặc số điện thoại không khớp. Vui lòng kiểm tra lại.' });
  }

  // Đọc DB một lần rồi dùng cho cả match lẫn gần khớp
  const danhSach = await store.layTatCa();

  const matches = await Promise.all(timMatch(me, danhSach).map(async (m) => {
    const [haiChieu, toiQT, hoQT] = await Promise.all([
      store.laMatchHaiChieu(me.id, m.trip.id),
      store.daQuanTam(me.id, m.trip.id),
      store.daQuanTam(m.trip.id, me.id),
    ]);
    return {
      ...congKhai(m.trip),
      kmDau: Number(m.kmDau.toFixed(2)),
      kmCuoi: Number(m.kmCuoi.toFixed(2)),
      lechPhut: m.lechPhut,
      ngayChung: m.tenNgay,
      lechLoaiXe: m.lechLoaiXe,
      kmToiTuyen: m.kmToiTuyen === null ? null : Number(m.kmToiTuyen.toFixed(2)),
      cachKhop: m.cachKhop,
      // Hai điểm đến cách xa nhau nhưng khách vẫn đi cùng đường tài xế.
      // Đánh dấu để giao diện giải thích, tránh người dùng thấy "cách 4.8 km" mà tưởng lỗi.
      xuongDocDuong: m.cachKhop !== 'gan-nhau',
      // Đón giữa đường (space-time): giờ tài xế tới đón/trả + khách đi bộ bao xa.
      // Chỉ có khi cachKhop === 'don-tuyen'. Làm tròn để hiển thị gọn.
      donGiuaDuong: m.donGiuaDuong ? {
        gioDon: m.donGiuaDuong.gioDon,
        gioTra: m.donGiuaDuong.gioTra,
        kmToiDiemDon: Number(m.donGiuaDuong.kmToiDiemDon.toFixed(2)),
        kmToiDiemTra: Number(m.donGiuaDuong.kmToiDiemTra.toFixed(2)),
        lechDonPhut: m.donGiuaDuong.lechDonPhut === null ? null : Math.round(m.donGiuaDuong.lechDonPhut),
        hanChot: m.donGiuaDuong.hanChot,
      } : null,
      // Toạ độ để VẼ CHẤM trên bản đồ. Làm tròn 3 chữ số thập phân (~110m):
      // đủ để nhìn ra có nằm trên đường đi hay không, nhưng không chỉ đúng nhà ai.
      diem: {
        start: [lamTron(m.trip.start_lat), lamTron(m.trip.start_lon)],
        end: [lamTron(m.trip.end_lat), lamTron(m.trip.end_lon)],
      },
      toiQuanTam: toiQT,
      hoQuanTam: hoQT,
      haiChieu,
      // Đây là chỗ duy nhất SĐT được phép lộ ra
      lienHe: haiChieu ? { phone: m.trip.phone, email: m.trip.email } : null,
    };
  }));

  // "Gần khớp": trượt đúng 1 tiêu chí và còn cứu được. Chỉ để người dùng biết
  // cơ hội nằm ở đâu — KHÔNG cho bày tỏ quan tâm, KHÔNG bao giờ lộ liên hệ.
  const ganKhop = timGanKhop(me, danhSach).map((g) => ({
    ...congKhai(g.trip),
    lyDo: g.lyDo,
    goiY: g.goiY,
    kmDau: Number(g.kmDau.toFixed(2)),
    kmCuoi: Number(g.kmCuoi.toFixed(2)),
    lechPhut: g.lechPhut,
    diem: {
      start: [lamTron(g.trip.start_lat), lamTron(g.trip.start_lon)],
      end: [lamTron(g.trip.end_lat), lamTron(g.trip.end_lon)],
    },
  }));

  return json(res, 200, {
    // Chuyến của chính mình thì được xem đầy đủ, kể cả tọa độ để vẽ lên bản đồ.
    // Tọa độ của NGƯỜI KHÁC không bao giờ gửi đi — chỉ gửi khoảng cách đã tính sẵn.
    me: {
      ...congKhai(me),
      code: me.code, phone: me.phone, email: me.email,
      start_lat: me.start_lat, start_lon: me.start_lon,
      end_lat: me.end_lat, end_lon: me.end_lon,
    },
    matches,
    ganKhop,
  });
}

async function handleQuanTam(req, res) {
  const b = await docBody(req);
  const me = await store.layTheoMa(String(b.code || '').trim().toUpperCase());
  if (!me) return json(res, 404, { error: 'Mã không đúng' });

  const target = await store.layTheoId(Number(b.targetId));
  if (!target) return json(res, 404, { error: 'Không tìm thấy chuyến kia' });
  if (target.id === me.id) return json(res, 400, { error: 'Không thể tự quan tâm chính mình' });

  // Chỉ cho bày tỏ quan tâm với chuyến THỰC SỰ khớp — chặn việc dò id bừa
  const hopLe = timMatch(me, await store.layTatCa()).some((m) => m.trip.id === target.id);
  if (!hopLe) return json(res, 400, { error: 'Chuyến này không khớp với bạn' });

  await store.bayToQuanTam(me.id, target.id);
  const haiChieu = await store.laMatchHaiChieu(me.id, target.id);
  return json(res, 200, {
    haiChieu,
    lienHe: haiChieu ? { phone: target.phone, email: target.email } : null,
  });
}

// ---- Phục vụ file tĩnh (có chặn path traversal) ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const full = path.join(PUBLIC_DIR, rel);
  // Chặn ../../ thoát ra ngoài thư mục public
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Cam truy cap');
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Khong tim thay');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      // Không cache: đang phát triển, sửa file xong phải thấy ngay.
      // Khi lên production thì đổi thành cache có kèm số phiên bản trong tên file.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(buf);
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Handler thuần (req, res). Tách rời để Vercel gọi trực tiếp (serverless) mà không
// cần server.listen — trên Vercel không có server chạy nền, chỉ có hàm xử lý request.
async function handler(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/api/geocode') {
      return json(res, 200, { results: await handleGeocode(url.searchParams.get('q')) });
    }
    if (url.pathname === '/api/reverse') {
      const lat = url.searchParams.get('lat');
      const lon = url.searchParams.get('lon');
      if (!lat || !lon) return json(res, 400, { error: 'Thieu lat/lon' });
      return json(res, 200, { result: await handleReverse(lat, lon) });
    }
    // Các hằng số dùng chung. Trình duyệt lấy từ đây thay vì chép lại,
    // để sửa đơn giá / ngưỡng chỉ phải sửa ĐÚNG MỘT chỗ trong match.js.
    if (url.pathname === '/api/config') {
      return json(res, 200, {
        DON_GIA,
        TEN_LOAI_XE,
        BAN_KINH_KM: RULES.BAN_KINH_KM,
        DUNG_SAI_PHUT: RULES.DUNG_SAI_PHUT,
      });
    }
    if (url.pathname === '/api/trips' && req.method === 'POST') {
      return await handleTaoChuyen(req, res);
    }
    if (url.pathname.startsWith('/api/trips/') && req.method === 'GET') {
      return await handleXemChuyen(res, url.pathname.slice('/api/trips/'.length),
        url.searchParams.get('name'), url.searchParams.get('phone'));
    }
    if (url.pathname === '/api/interest' && req.method === 'POST') {
      return await handleQuanTam(req, res);
    }
    // geo.js nay nam trong public/ -> serveStatic phuc vu binh thuong (giong app.js).
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[loi]', err.message);
    return json(res, 502, { error: 'Khong lay duoc du lieu ban do: ' + err.message });
  }
}

const server = http.createServer(handler);

// Chỉ tự chạy server khi gọi trực tiếp `node server.js` (local). Khi bị require
// (test, hoặc api/index.js trên Vercel) thì KHÔNG listen — chỉ xuất handler ra.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`ShareYourBike dang chay: http://localhost:${PORT}`);
  });
}

// Export mặc định LÀ handler (function) để Vercel dùng trực tiếp file này như một
// serverless function hợp lệ ("default export must be a function or server").
// Vẫn gắn kèm .handler/.server cho api/index.js và test dùng theo tên.
module.exports = handler;
module.exports.handler = handler;
module.exports.server = server;
