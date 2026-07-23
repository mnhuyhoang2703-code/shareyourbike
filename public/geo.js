// geo.js — toán học địa lý dùng chung cho server và trình duyệt.
// Không phụ thuộc thư viện nào, không gọi mạng => matching sau này tốn 0 đồng.

const R_EARTH_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Khoảng cách đường chim bay giữa 2 điểm (km).
 * Dùng để kiểm tra "điểm khởi hành cách nhau < 2km".
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Khoảng cách từ 1 điểm tới đoạn thẳng AB (km).
 * Ở phạm vi vài chục km quanh TPHCM, chiếu lat/lon sang mặt phẳng phẳng
 * đủ chính xác (sai số < 0.5%), nên không cần công thức cầu phức tạp.
 */
function pointToSegmentKm(pLat, pLon, aLat, aLon, bLat, bLon) {
  const kx = 111.32 * Math.cos(toRad(pLat)); // km trên 1 độ kinh tuyến
  const ky = 110.574; // km trên 1 độ vĩ tuyến
  const px = pLon * kx, py = pLat * ky;
  const ax = aLon * kx, ay = aLat * ky;
  const bx = bLon * kx, by = bLat * ky;

  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  // t = vị trí hình chiếu trên đoạn, kẹp về [0,1] để không chiếu ra ngoài đoạn
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Khoảng cách ngắn nhất từ 1 điểm tới cả tuyến đường (mảng [lat, lon]).
 * Đây là cách trả lời "điểm kết thúc có nằm trên tuyến của tài xế không".
 */
function pointToRouteKm(pLat, pLon, route) {
  if (!route || route.length === 0) return Infinity;
  if (route.length === 1) return haversineKm(pLat, pLon, route[0][0], route[0][1]);
  let min = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = pointToSegmentKm(pLat, pLon, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Chiếu 1 điểm lên tuyến, trả về { km, f }:
 *   - km: khoảng cách vuông góc từ điểm tới tuyến (như pointToRouteKm).
 *   - f : tỉ lệ [0,1] vị trí hình chiếu dọc theo tuyến, tính theo QUÃNG ĐƯỜNG
 *         tích lũy. f=0 là đầu tuyến, f=1 là cuối tuyến.
 *
 * Đây là mảnh còn thiếu để trả lời "tài xế tới điểm này lúc mấy giờ": có f rồi,
 * chỉ cần nội suy giữa giờ xuất phát và giờ tới nơi của tài xế theo tỉ lệ thuận.
 * Độ dài đoạn dùng haversine (chính xác); tham số chiếu t dùng phép chiếu phẳng
 * cục bộ — cùng cách xấp xỉ với pointToSegmentKm, đủ ở phạm vi TPHCM.
 */
function chieuLenTuyen(pLat, pLon, route) {
  if (!Array.isArray(route) || route.length < 2) return { km: Infinity, f: null };

  const segLen = [];
  let tong = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const L = haversineKm(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
    segLen.push(L);
    tong += L;
  }
  if (tong === 0) return { km: haversineKm(pLat, pLon, route[0][0], route[0][1]), f: 0 };

  const kx = 111.32 * Math.cos(toRad(pLat));
  const ky = 110.574;
  const px = pLon * kx, py = pLat * ky;

  let bestKm = Infinity, bestF = null, cum = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const ax = route[i][1] * kx, ay = route[i][0] * ky;
    const bx = route[i + 1][1] * kx, by = route[i + 1][0] * ky;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (dist < bestKm) {
      bestKm = dist;
      bestF = (cum + t * segLen[i]) / tong;
    }
    cum += segLen[i];
  }
  return { km: bestKm, f: bestF };
}

// Khung bao TPHCM — dùng để ép Nominatim chỉ tìm trong thành phố.
const HCMC_BBOX = { lonMin: 106.35, latMin: 10.35, lonMax: 107.03, latMax: 11.20 };
const HCMC_CENTER = [10.7769, 106.7009];

function isInHCMC(lat, lon) {
  return lat >= HCMC_BBOX.latMin && lat <= HCMC_BBOX.latMax &&
         lon >= HCMC_BBOX.lonMin && lon <= HCMC_BBOX.lonMax;
}

// Cho phép dùng ở cả Node (require) lẫn trình duyệt (window.Geo)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { haversineKm, pointToSegmentKm, pointToRouteKm, chieuLenTuyen, isInHCMC, HCMC_BBOX, HCMC_CENTER };
} else {
  window.Geo = { haversineKm, pointToSegmentKm, pointToRouteKm, chieuLenTuyen, isInHCMC, HCMC_BBOX, HCMC_CENTER };
}
