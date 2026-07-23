// match.js — Toàn bộ luật ghép chuyến. Hàm thuần, không đụng DB, không gọi mạng
// => test được độc lập và chạy tốn 0 đồng dù bao nhiêu người dùng.

const { haversineKm, pointToRouteKm, pointToSegmentKm, chieuLenTuyen } = require('./geo.js');

// Các ngưỡng gom về một chỗ để sau này chỉnh không phải đi lùng khắp code
const RULES = {
  BAN_KINH_KM: 2,        // điểm khởi hành / điểm kết thúc phải nằm trong 2km
  DUNG_SAI_PHUT: 15,     // giờ đón lệch tối đa 15 phút

  // Với chuyến DÀI, tài xế có nhiều lựa chọn đường đi và thường sẵn sàng lệch
  // chút ít. Tuyến OSRM chỉ là MỘT đường trong nhiều đường khả dĩ, bám cứng vào
  // nó sẽ bỏ lỡ khách nằm trên đường song song.
  // => Chuyến dài hơn 5km chim bay thì chấp nhận thêm: điểm đến nằm trong hành
  //    lang 1.5km quanh ĐƯỜNG CHIM BAY của tài xế.
  // Chuyến ngắn KHÔNG áp dụng, vì lúc đó hành lang phủ gần hết chuyến đi,
  // ghép ra kết quả vô nghĩa. (Luật do Hoàng đề xuất, chốt 21/07/2026.)
  CHUYEN_DAI_KM: 5,
  HANH_LANG_KM: 1.5,

  // ĐÓN GIỮA ĐƯỜNG (space-time) — luật ghép bổ sung, chỉ bật khi điểm khởi hành
  // hai người CÁCH XA nhau (khách không đứng gần chỗ tài xế xuất phát) mà tài xế
  // có TUYẾN THẬT + biết GIỜ TỚI NƠI thường ngày. Khi đó tài xế vẫn đón được
  // khách ngay trên đường đi, miễn tới đúng lúc. Luật same-origin cũ không đụng.
  //  - Neo thời gian: giờ xuất phát + giờ tới nơi của TÀI XẾ (chuyến quen hằng
  //    ngày nên giờ tới rất chính xác) → nội suy vị trí tài xế theo tỉ lệ quãng
  //    đường dọc tuyến.
  //  - dropoff của KHÁCH mang nghĩa khác: HẠN CHÓT tới nơi chấp nhận được (≤).
  // (Luật do Hoàng đề xuất, chốt 22/07/2026.)
  BAN_KINH_DON_KM: 1.5,  // khách phải cách tuyến ≤ 1.5km để ra được điểm đón

  // Người đi nhờ nêu mong muốn loại xe mà tài xế đi loại khác: VẪN hiện,
  // nhưng cộng điểm phạt lớn để luôn nằm dưới các kết quả đúng loại.
  // Cố tình KHÔNG lọc cứng: lúc còn ít người dùng, lọc cứng dễ ra 0 kết quả.
  PHAT_LECH_LOAI_XE: 1000,

  // Biên độ cho mục "Gần khớp" — KHÔNG dùng để ghép, chỉ để báo cho người dùng
  // biết cơ hội đang nằm ở đâu để họ tự điều chỉnh.
  GAN_PHUT: 90,          // lệch giờ tới mức này vẫn còn đáng nói
  GAN_BAN_KINH_KM: 4,    // lệch vị trí tới mức này vẫn còn đáng nói
};

// Giá khuyến nghị theo quãng đường (đồng / km).
// ĐÂY LÀ NGUỒN DUY NHẤT — trình duyệt lấy qua /api/config, không chép lại.
// Chốt 21/07/2026 cho sát giá xe công nghệ ở TPHCM: 5k/km xe máy, 8k/km xe hơi.
const DON_GIA = { bike: 5000, car: 8000 };
const TEN_LOAI_XE = { bike: 'Xe máy', car: 'Xe hơi' };

/** Giá gợi ý cho quãng đường km, làm tròn tới 1.000đ. */
function giaKhuyenNghi(km, loaiXe) {
  const donGia = DON_GIA[loaiXe] || DON_GIA.bike;
  return Math.round((km * donGia) / 1000) * 1000;
}

/** "07:30" -> 450 (số phút kể từ 0h). Trả null nếu sai định dạng. */
function gioSangPhut(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]), p = Number(m[2]);
  if (h > 23 || p > 59) return null;
  return h * 60 + p;
}

/** 450 -> "07:30" */
function phutSangGio(phut) {
  const h = Math.floor(phut / 60), p = phut % 60;
  return `${String(h).padStart(2, '0')}:${String(p).padStart(2, '0')}`;
}

/** "2,4,6" -> [2,4,6]. Quy ước: 2=Thứ Hai ... 7=Thứ Bảy, 8=Chủ Nhật */
function tachNgay(days) {
  if (Array.isArray(days)) return days.map(Number).filter((n) => n >= 2 && n <= 8);
  return String(days || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n >= 2 && n <= 8);
}

const TEN_NGAY = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };

/** Các ngày cả hai cùng đi. */
function ngayChung(a, b) {
  const setB = new Set(tachNgay(b));
  return tachNgay(a).filter((d) => setB.has(d));
}

/**
 * ĐÓN GIỮA ĐƯỜNG (space-time). Tài xế đón khách ngay trên tuyến quen của mình.
 * Chỉ hợp lệ khi ĐỦ mọi điều kiện:
 *   - điểm đầu hai người CÁCH XA (kmDau > bán kính) — gần nhau thì đã là luật cũ;
 *   - tài xế có tuyến thật + biết giờ xuất phát (pickup) VÀ giờ tới nơi (dropoff),
 *     với dropoff > pickup → dựng được timeline;
 *   - điểm đón & điểm trả của khách đều bám sát tuyến, đúng chiều đi (đón trước trả);
 *   - tài xế tới ĐIỂM ĐÓN đúng khoảng giờ khách muốn đi (±dung sai);
 *   - tài xế tới ĐIỂM TRẢ không trễ hơn HẠN CHÓT của khách (dropoff khách; bỏ qua
 *     nếu khách không khai).
 * Vị trí tài xế theo thời gian = nội suy tỉ lệ thuận quãng đường dọc tuyến giữa hai
 * mốc pickup/dropoff của tài xế (chuyến quen hằng ngày nên giờ rất sát thực tế).
 */
function xetDonGiuaDuong(taiXe, khach, kmDau, rules) {
  const khongAp = { hopLe: false };
  if (kmDau <= rules.BAN_KINH_KM) return khongAp;          // gần nhau -> luật cũ lo
  if (!Array.isArray(taiXe.route) || taiXe.route.length < 2) return khongAp;

  const xuatPhat = gioSangPhut(taiXe.pickup);
  const toiNoi = gioSangPhut(taiXe.dropoff);
  if (xuatPhat === null || toiNoi === null || toiNoi <= xuatPhat) return khongAp;

  const cDon = chieuLenTuyen(khach.start_lat, khach.start_lon, taiXe.route);
  const cTra = chieuLenTuyen(khach.end_lat, khach.end_lon, taiXe.route);
  if (cDon.f === null || cTra.f === null) return khongAp;

  const tong = toiNoi - xuatPhat;
  const tDon = xuatPhat + cDon.f * tong;   // giờ tài xế tới ĐIỂM ĐÓN của khách
  const tTra = xuatPhat + cTra.f * tong;   // giờ tài xế tới ĐIỂM TRẢ của khách

  const gioMuon = gioSangPhut(khach.pickup);  // giờ khách muốn được đón
  const hanChot = gioSangPhut(khach.dropoff); // HẠN CHÓT tới nơi; null = không khai

  const bamTuyenDon = cDon.km <= rules.BAN_KINH_DON_KM;
  const bamTuyenTra = cTra.km <= rules.BAN_KINH_KM;
  const dungChieu = cDon.f < cTra.f;
  const donDungGio = gioMuon !== null && Math.abs(tDon - gioMuon) <= rules.DUNG_SAI_PHUT;
  const kipHan = hanChot === null ? true : tTra <= hanChot;

  return {
    hopLe: bamTuyenDon && bamTuyenTra && dungChieu && donDungGio && kipHan,
    kmDon: cDon.km, kmTra: cTra.km, fDon: cDon.f, fTra: cTra.f,
    tDon, tTra, gioMuon, hanChot,
    lechDon: gioMuon === null ? null : Math.abs(tDon - gioMuon),
  };
}

/**
 * Đo TẤT CẢ tiêu chí của một cặp chuyến và trả về danh sách tiêu chí trượt.
 *
 * Cố ý KHÔNG dừng ở tiêu chí trượt đầu tiên: cần biết một cặp trượt vì MẤY
 * tiêu chí thì mới nói được "hai người này gần khớp, chỉ lệch giờ" — thứ giúp
 * người dùng tự điều chỉnh thay vì nhìn màn hình trống.
 */
function danhGiaCap(me, other, rules = RULES) {
  const truot = [];

  // 1. Phải ngược vai: người có xe ghép với người cần đi nhờ
  const nguocVai = me.role !== other.role;
  if (!nguocVai) truot.push({ ma: 'vai-tro', moTa: 'Cùng vai trò' });

  // Khi cùng vai trò thì các phép so sánh dưới vô nghĩa (không có ai là tài xế),
  // nên dừng luôn — đây là tiêu chí duy nhất không bao giờ "gần khớp" được.
  if (!nguocVai) return { truot, nguocVai };

  const taiXe = me.role === 'driver' ? me : other;
  const khach = me.role === 'driver' ? other : me;

  // 2. Điểm khởi hành gần nhau
  const kmDau = haversineKm(me.start_lat, me.start_lon, other.start_lat, other.start_lon);

  // 2b. ĐÓN GIỮA ĐƯỜNG (space-time). Chỉ xét khi điểm đầu CÁCH XA — tức luật
  // same-origin ở tiêu chí 2 không cứu được. Nếu hợp lệ, nó THAY THẾ luôn các
  // kiểm tra điểm-đầu / điểm-cuối / giờ ở dạng cũ (vì đã kiểm cả không gian lẫn
  // thời gian ngay trong hàm); nếu không, mọi tiêu chí chạy y như trước.
  const donGiuaDuong = xetDonGiuaDuong(taiXe, khach, kmDau, rules);
  const dungDonGiuaDuong = donGiuaDuong.hopLe;

  if (kmDau > rules.BAN_KINH_KM && !dungDonGiuaDuong) {
    truot.push({ ma: 'diem-dau', moTa: `Điểm khởi hành cách ${kmDau.toFixed(1)} km` });
  }

  // 3. Điểm kết thúc: đạt nếu THỎA MÃN MỘT trong ba cách (hoặc đã qua đón-giữa-đường).
  const kmCuoi = haversineKm(me.end_lat, me.end_lon, other.end_lat, other.end_lon);

  // (a) Hai điểm đến vốn đã gần nhau
  const ganNhau = kmCuoi <= rules.BAN_KINH_KM;

  // (b) Điểm đến của khách nằm trên TUYẾN THẬT tài xế đi (chính xác nhất)
  let kmToiTuyen = Infinity;
  if (Array.isArray(taiXe.route) && taiXe.route.length > 1) {
    kmToiTuyen = pointToRouteKm(khach.end_lat, khach.end_lon, taiXe.route);
  }
  const trenTuyen = kmToiTuyen <= rules.BAN_KINH_KM;

  // (c) Chuyến DÀI: điểm đến nằm trong hành lang quanh đường chim bay.
  //     Lưới an toàn — vẫn chạy khi OSRM lỗi, và bắt được cả khách nằm trên
  //     đường song song mà tuyến OSRM cụ thể không đi qua.
  const doDaiChuyen = haversineKm(taiXe.start_lat, taiXe.start_lon, taiXe.end_lat, taiXe.end_lon);
  const laChuyenDai = doDaiChuyen > rules.CHUYEN_DAI_KM;
  const kmToiHanhLang = pointToSegmentKm(
    khach.end_lat, khach.end_lon,
    taiXe.start_lat, taiXe.start_lon, taiXe.end_lat, taiXe.end_lon,
  );
  const trongHanhLang = laChuyenDai && kmToiHanhLang <= rules.HANH_LANG_KM;

  if (!ganNhau && !trenTuyen && !trongHanhLang && !dungDonGiuaDuong) {
    truot.push({
      ma: 'diem-cuoi',
      moTa: laChuyenDai
        ? `Điểm kết thúc cách ${kmCuoi.toFixed(1)} km và không nằm trên đường đi`
        : `Điểm kết thúc cách ${kmCuoi.toFixed(1)} km`,
    });
  }

  // 4. Giờ đón lệch trong dung sai.
  // Với đón-giữa-đường, thời gian ĐÃ được kiểm ở 2b (giờ tài xế TỚI ĐIỂM ĐÓN so
  // với giờ khách muốn + hạn chót tới nơi), nên KHÔNG so giờ pickup thô nữa — hai
  // người xuất phát ở hai nơi khác nhau, so giờ xuất phát thô là vô nghĩa.
  const gioA = gioSangPhut(me.pickup);
  const gioB = gioSangPhut(other.pickup);
  const thieuGio = gioA === null || gioB === null;
  const lechPhut = thieuGio ? null : Math.abs(gioA - gioB);
  if (!dungDonGiuaDuong) {
    if (thieuGio) {
      truot.push({ ma: 'thieu-gio', moTa: 'Thiếu giờ đón' });
    } else if (lechPhut > rules.DUNG_SAI_PHUT) {
      truot.push({ ma: 'gio', moTa: `Giờ đón lệch ${lechPhut} phút` });
    }
  }

  // 5. Phải có ít nhất 1 ngày cùng đi
  const ngay = ngayChung(me.days, other.days);
  if (ngay.length === 0) {
    truot.push({ ma: 'ngay', moTa: 'Không trùng ngày nào trong tuần' });
  }

  // 6. Loại xe — KHÔNG loại bỏ, chỉ ảnh hưởng thứ tự.
  const mongMuon = khach.want_type || 'any';
  const loaiXeThat = taiXe.vehicle_type || null;
  const lechLoaiXe = mongMuon !== 'any' && Boolean(loaiXeThat) && loaiXeThat !== mongMuon;

  return {
    truot, nguocVai,
    kmDau, kmCuoi, doDaiChuyen, laChuyenDai,
    kmToiTuyen: kmToiTuyen === Infinity ? null : kmToiTuyen,
    kmToiHanhLang,
    ganNhau, trenTuyen, trongHanhLang,
    donGiuaDuong, dungDonGiuaDuong,
    lechPhut, ngay, lechLoaiXe, mongMuonLoaiXe: mongMuon,
  };
}

/**
 * Xét 1 cặp chuyến. Khớp = không trượt tiêu chí nào.
 */
function xetCap(me, other, rules = RULES) {
  const d = danhGiaCap(me, other, rules);
  if (d.truot.length > 0) {
    return { khop: false, lyDo: d.truot[0].moTa, truot: d.truot };
  }

  // Ghi lại NHỜ ĐÂU mà khớp, để giao diện giải thích được cho người dùng
  // và để sau này đánh giá luật nào đang thực sự tạo ra match.
  // 'don-tuyen' chỉ xảy ra khi điểm đầu cách xa (kmDau>bán kính) nên không đụng
  // 'gan-nhau'.
  const cachKhop = d.dungDonGiuaDuong ? 'don-tuyen'
    : d.ganNhau ? 'gan-nhau' : (d.trenTuyen ? 'tren-tuyen' : 'hanh-lang');

  const dg = d.donGiuaDuong;

  // Xếp hạng. Đón-giữa-đường tính theo khoảng cách đi bộ ra điểm đón/trả + lệch
  // giờ tài xế tới đón; cộng +1 để một match same-origin tương đương (chắc chắn
  // hơn) vẫn xếp trên. Các cách khớp cũ giữ nguyên công thức đã kiểm chứng.
  const diem = cachKhop === 'don-tuyen'
    ? dg.kmDon + dg.kmTra + (dg.lechDon ?? 0) / 10 + 1
      + (d.lechLoaiXe ? rules.PHAT_LECH_LOAI_XE : 0)
    : d.kmDau + d.kmCuoi + d.lechPhut / 10
      + (cachKhop === 'hanh-lang' ? 2 : 0)
      + (d.lechLoaiXe ? rules.PHAT_LECH_LOAI_XE : 0);

  return {
    khop: true,
    kmDau: d.kmDau,
    kmCuoi: d.kmCuoi,
    kmToiTuyen: d.kmToiTuyen,
    kmToiHanhLang: d.kmToiHanhLang,
    doDaiChuyen: d.doDaiChuyen,
    cachKhop,
    lechPhut: d.lechPhut,
    // Thông tin đón-giữa-đường cho giao diện: "tài xế tới đón lúc HH:MM", khách
    // đi bộ bao xa ra điểm đón/trả, có kịp hạn chót không.
    donGiuaDuong: cachKhop === 'don-tuyen' ? {
      gioDon: phutSangGio(Math.round(dg.tDon)),
      gioTra: phutSangGio(Math.round(dg.tTra)),
      kmToiDiemDon: dg.kmDon,
      kmToiDiemTra: dg.kmTra,
      lechDonPhut: dg.lechDon,
      hanChot: dg.hanChot === null ? null : phutSangGio(dg.hanChot),
    } : null,
    ngayChung: d.ngay,
    tenNgay: d.ngay.map((n) => TEN_NGAY[n]).join(', '),
    lechLoaiXe: d.lechLoaiXe,
    mongMuonLoaiXe: d.mongMuonLoaiXe,
    diem,
  };
}

/**
 * "Gần khớp": trượt ĐÚNG MỘT tiêu chí, và trượt trong biên độ còn cứu được.
 *
 * Mục đích không phải để ghép, mà để người dùng BIẾT cơ hội đang nằm ở đâu:
 * "có người đi đúng tuyến của bạn, chỉ đón sớm hơn 1 tiếng" thì họ còn tự đổi
 * giờ được. Màn hình trống thì họ chỉ biết bỏ đi.
 */
function xetGanKhop(me, other, rules = RULES) {
  const d = danhGiaCap(me, other, rules);

  // Khớp hẳn rồi thì không phải "gần khớp"
  if (d.truot.length === 0) return { ganKhop: false };
  // Trượt từ 2 tiêu chí trở lên thì quá xa, nói ra chỉ gây nhiễu
  if (d.truot.length > 1) return { ganKhop: false };

  const { ma, moTa } = d.truot[0];

  // Xét từng loại trượt xem có nằm trong tầm cứu được không
  let cuuDuoc = false;
  let goiY = '';
  if (ma === 'gio' && d.lechPhut <= rules.GAN_PHUT) {
    cuuDuoc = true;
    goiY = `Lệch ${d.lechPhut} phút — đổi giờ đón là gặp được nhau`;
  } else if (ma === 'diem-dau' && d.kmDau <= rules.GAN_BAN_KINH_KM) {
    cuuDuoc = true;
    goiY = `Điểm đón cách ${d.kmDau.toFixed(1)} km — hẹn nhau ở giữa là được`;
  } else if (ma === 'diem-cuoi') {
    const gan = Math.min(d.kmCuoi, d.kmToiTuyen ?? Infinity, d.kmToiHanhLang);
    if (gan <= rules.GAN_BAN_KINH_KM) {
      cuuDuoc = true;
      goiY = `Điểm đến lệch ${gan.toFixed(1)} km — có thể xuống dọc đường`;
    }
  } else if (ma === 'ngay') {
    cuuDuoc = true;
    goiY = 'Không trùng ngày nào — xem lại lịch của hai bên';
  }

  if (!cuuDuoc) return { ganKhop: false };

  return {
    ganKhop: true,
    ma, lyDo: moTa, goiY,
    kmDau: d.kmDau,
    kmCuoi: d.kmCuoi,
    lechPhut: d.lechPhut,
    tenNgay: d.ngay.map((n) => TEN_NGAY[n]).join(', '),
    // Xếp hạng: lệch giờ dễ khắc phục nhất nên lên đầu, rồi tới điểm đón/đến
    diem: (ma === 'gio' ? 0 : ma === 'diem-dau' ? 100 : ma === 'diem-cuoi' ? 200 : 300)
      + d.kmDau + (d.lechPhut ?? 0) / 60,
  };
}

/** Lọc toàn bộ danh sách, trả về các chuyến khớp đã xếp hạng. */
function timMatch(me, danhSach, rules = RULES) {
  const ketQua = [];
  for (const other of danhSach) {
    if (other.id === me.id) continue;
    const kq = xetCap(me, other, rules);
    if (kq.khop) ketQua.push({ trip: other, ...kq });
  }
  return ketQua.sort((a, b) => a.diem - b.diem);
}

/** Các chuyến gần khớp, đã xếp hạng theo mức độ dễ khắc phục. */
function timGanKhop(me, danhSach, rules = RULES) {
  const ketQua = [];
  for (const other of danhSach) {
    if (other.id === me.id) continue;
    const kq = xetGanKhop(me, other, rules);
    if (kq.ganKhop) ketQua.push({ trip: other, ...kq });
  }
  return ketQua.sort((a, b) => a.diem - b.diem);
}

module.exports = {
  RULES, DON_GIA, TEN_LOAI_XE, giaKhuyenNghi,
  timMatch, xetCap, danhGiaCap, timGanKhop, xetGanKhop, xetDonGiuaDuong,
  gioSangPhut, phutSangGio, tachNgay, ngayChung, TEN_NGAY,
};
