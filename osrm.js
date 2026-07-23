// osrm.js — Lấy tuyến đường thật giữa hai điểm.
//
// Đây là thứ kích hoạt luật ghép thứ hai: "điểm kết thúc của người đi nhờ nằm
// TRÊN TUYẾN của người có xe". Không có tuyến thì chỉ so được hai điểm cuối
// với nhau, và những ca như Tân Phú -> Cát Lái (khách xuống ở An Khánh, ngay
// trên đường đi) sẽ bị bỏ lỡ oan.
//
// Vì sao KHÔNG dùng đường thẳng để xấp xỉ: ở TPHCM có sông Sài Gòn. Một điểm
// có thể cách đường thẳng 200m nhưng phải đi vòng 8km qua cầu mới tới được.

const HOST = process.env.OSRM_HOST || 'https://router.project-osrm.org';

// Máy chủ demo công khai của OSRM: miễn phí, có giới hạn tần suất, họ ghi rõ
// không dành cho chạy thật. Đủ cho giai đoạn này. Khi có người dùng thật thì
// đổi biến môi trường OSRM_HOST sang máy chủ tự dựng.
let lanGoiCuoi = 0;
const GIAN_CACH_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Trả về { route: [[lat,lon],...], km } hoặc null nếu không lấy được.
 * KHÔNG bao giờ ném lỗi ra ngoài — không lấy được tuyến thì chuyến vẫn phải
 * đăng được, chỉ là tạm thiếu luật ghép thứ hai.
 */
async function layTuyen(startLat, startLon, endLat, endLon, { timeoutMs = 8000 } = {}) {
  // OSRM nhận toạ độ theo thứ tự lon,lat — ngược với thói quen lat,lon
  const toado = `${startLon},${startLat};${endLon},${endLat}`;
  const url = `${HOST}/route/v1/driving/${toado}?overview=simplified&geometries=geojson`;

  const cho = GIAN_CACH_MS - (Date.now() - lanGoiCuoi);
  if (cho > 0) await sleep(cho);
  lanGoiCuoi = Date.now();

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ShareYourBike/0.1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`OSRM tra ve ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      throw new Error('OSRM khong tim duoc tuyen: ' + (data.code || 'khong ro'));
    }

    const toaDoTuyen = data.routes[0].geometry.coordinates; // [[lon,lat],...]
    if (!Array.isArray(toaDoTuyen) || toaDoTuyen.length < 2) {
      throw new Error('Tuyen tra ve qua ngan');
    }

    return {
      route: toaDoTuyen.map(([lon, lat]) => [lat, lon]), // đổi về [lat,lon]
      km: Math.round((data.routes[0].distance / 1000) * 100) / 100,
    };
  } catch (err) {
    console.error('[osrm] khong lay duoc tuyen:', err.message);
    return null;
  }
}

module.exports = { layTuyen, HOST };
