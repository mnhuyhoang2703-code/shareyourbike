// app.js — Giao diện đăng chuyến + xem match.

// ================= BẢN ĐỒ =================
const map = L.map('map').setView(Geo.HCMC_CENTER, 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const points = { start: null, end: null };
let activeField = 'start';
let line = null;
const markers = { start: null, end: null };

// Chỉ cho phép chỉnh điểm (kéo marker / bấm bản đồ) khi ĐANG ĐĂNG chuyến.
// Ở màn xem kết quả, chuyến đã lưu vào DB rồi — kéo marker không sửa được gì,
// chỉ làm người dùng tưởng đã đổi điểm đón trong khi match vẫn tính theo toạ độ cũ.
let choPhepChinhDiem = true;

// ================= MÀN CHÀO (hiện mỗi lần vào) =================
// Chốt với Hoàng 22/07/2026: luôn hiện disclaimer + bắt tick đồng ý mỗi lần mở web,
// KHÔNG nhớ máy. Nhấn mạnh web chỉ giới thiệu liên hệ, không thu phí.
(function manChao() {
  const overlay = document.getElementById('welcome');
  const check = document.getElementById('agree-check');
  const btnDang = document.getElementById('btn-go-dang');
  const btnXem = document.getElementById('btn-go-xem');
  check.addEventListener('change', () => {
    btnDang.disabled = btnXem.disabled = !check.checked;
  });
  // Chọn luôn màn muốn vào: Đăng chuyến hoặc thẳng qua Xem kết quả.
  const vaoApp = (view) => {
    if (!check.checked) return;
    showView(view);
    overlay.classList.add('is-gone');
    // Bản đồ khởi tạo khi overlay còn che -> tính sai kích thước. Vẽ lại cho khớp.
    setTimeout(() => map.invalidateSize(), 350);
    if (view === 'xem') document.getElementById('ma-input').focus();
  };
  btnDang.addEventListener('click', () => vaoApp('dang'));
  btnXem.addEventListener('click', () => vaoApp('xem'));
})();

function capNhatQuyenKeo() {
  for (const m of Object.values(markers)) {
    if (!m || !m.dragging) continue;
    if (choPhepChinhDiem) m.dragging.enable();
    else m.dragging.disable();
  }
}

// ================= MARKER HÌNH HẢI CẨU =================
// Điểm đón = hải cẩu XANH, điểm trả = hải cẩu HỒNG (đồng bộ với trang trí nền).
// Cùng một mẫu SVG, chỉ đổi bảng màu.
const SEAL_PAL = {
  blue: { body: '#bcdcec', belly: '#eaf6fc', flip: '#a6cadd', whisk: '#a9c6d6', blush: '#ffb9d0', nose: '#7d98a6', smile: '#6f8b99' },
  pink: { body: '#f8cdde', belly: '#fdeaf2', flip: '#f0b3ca', whisk: '#e7aec4', blush: '#a6cadd', nose: '#c77e9a', smile: '#c77e9a' },
};
function sealSVG(p) {
  return `<svg viewBox='0 0 130 100' xmlns='http://www.w3.org/2000/svg'>
    <ellipse cx='34' cy='80' rx='13' ry='7.5' fill='${p.flip}' transform='rotate(-22 34 80)'/>
    <ellipse cx='96' cy='80' rx='13' ry='7.5' fill='${p.flip}' transform='rotate(22 96 80)'/>
    <ellipse cx='65' cy='62' rx='40' ry='34' fill='${p.body}'/>
    <ellipse cx='65' cy='72' rx='25' ry='23' fill='${p.belly}'/>
    <ellipse cx='47' cy='58' rx='4.5' ry='2.8' fill='${p.blush}' opacity='.75'/>
    <ellipse cx='83' cy='58' rx='4.5' ry='2.8' fill='${p.blush}' opacity='.75'/>
    <circle cx='53' cy='51' r='3.6' fill='#41484d'/><circle cx='77' cy='51' r='3.6' fill='#41484d'/>
    <circle cx='54.3' cy='49.7' r='1.2' fill='#fff'/><circle cx='78.3' cy='49.7' r='1.2' fill='#fff'/>
    <ellipse cx='65' cy='59' rx='3.2' ry='2.2' fill='${p.nose}'/>
    <path d='M58 63 Q65 69 72 63' stroke='${p.smile}' stroke-width='1.8' fill='none' stroke-linecap='round'/>
    <path d='M44 56 H29 M45 60 H30' stroke='${p.whisk}' stroke-width='1.4' fill='none' stroke-linecap='round'/>
    <path d='M86 56 H101 M85 60 H100' stroke='${p.whisk}' stroke-width='1.4' fill='none' stroke-linecap='round'/>
  </svg>`;
}
// caption: chữ dưới hải cẩu (tên người / "Bạn"). opts.mine to hơn + nhãn nổi bật; opts.faded cho "gần khớp".
function sealIcon(variant, caption, opts = {}) {
  // Huy hiệu tròn nền trắng + viền màu để hải cẩu nổi bật trên nền bản đồ.
  const w = opts.mine ? 56 : opts.faded ? 40 : 48;
  const cap = caption
    ? `<div class="seal-cap${opts.mine ? ' mine' : ''}">${esc(caption)}</div>` : '';
  const html =
    `<div class="seal-marker${opts.faded ? ' faded' : ''}">
       <div class="seal-inner seal-${variant}" style="width:${w}px;height:${w}px">${sealSVG(SEAL_PAL[variant])}</div>${cap}
     </div>`;
  return L.divIcon({ className: 'seal-div', html, iconSize: [w, w], iconAnchor: [w / 2, w / 2] });
}

// Nhãn cho marker CỦA MÌNH: null ở màn đăng, "Bạn" ở màn kết quả (để phân biệt với người khác).
let nhanDiemToi = null;
const iconToi = (which) =>
  sealIcon(which === 'start' ? 'blue' : 'pink', nhanDiemToi, { mine: Boolean(nhanDiemToi) });
function capNhatIconToi() {
  if (markers.start) markers.start.setIcon(iconToi('start'));
  if (markers.end) markers.end.setIcon(iconToi('end'));
}

function setPoint(which, place) {
  points[which] = place;

  const field = document.querySelector(`.field[data-point="${which}"]`);
  field.querySelector('input').value = place.label;
  const coordsEl = field.querySelector('.coords');
  coordsEl.textContent = `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`;
  coordsEl.hidden = false;

  if (markers[which]) {
    markers[which].setLatLng([place.lat, place.lon]);
    markers[which].setIcon(iconToi(which));
  } else {
    markers[which] = L.marker([place.lat, place.lon], {
      icon: iconToi(which), draggable: choPhepChinhDiem,
    }).addTo(map);
    // Kéo marker = chỉnh lại điểm, tiện khi gợi ý lệch vài chục mét
    markers[which].on('dragend', async (e) => {
      if (!choPhepChinhDiem) return; // chốt chặn thứ hai, phòng khi quên tắt dragging
      const { lat, lng } = e.target.getLatLng();
      const found = await reverseLookup(lat, lng);
      setPoint(which, found || { label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lon: lng });
    });
  }
  capNhatQuyenKeo();

  redraw();
  // Đang ĐĂNG chuyến: zoom sát ghim vừa thả để user kiểm tra / kéo chỉnh cho đúng.
  // Màn xem kết quả (không được chỉnh điểm) thì để redraw() fit cả tuyến.
  if (choPhepChinhDiem) map.setView([place.lat, place.lon], 16);
  if (which === 'start' && !points.end) activeField = 'end';
}

function redraw() {
  const { start, end } = points;
  if (line) { map.removeLayer(line); line = null; }
  const summaryEl = document.getElementById('summary');

  if (start && end) {
    line = L.polyline([[start.lat, start.lon], [end.lat, end.lon]], {
      color: '#1f6feb', weight: 3, opacity: 0.7, dashArray: '6, 6',
    }).addTo(map);
    const km = Geo.haversineKm(start.lat, start.lon, end.lat, end.lon);
    summaryEl.hidden = false;
    summaryEl.innerHTML = `<strong>${km.toFixed(2)} km</strong>Quãng đường mỗi chiều (đường chim bay).`;
    // Chỉ fit cả tuyến ở màn xem kết quả. Khi đang đăng, setPoint() lo việc zoom
    // sát từng ghim vừa thả để user kiểm tra — không tự kéo ra xa nữa.
    if (!choPhepChinhDiem) map.fitBounds(line.getBounds(), { padding: [50, 50] });
  } else {
    summaryEl.hidden = true;
  }
  // Giá gợi ý phụ thuộc quãng đường nên phải tính lại mỗi khi điểm thay đổi.
  // Hàm khai báo phía dưới, lúc redraw() chạy thật thì đã có sẵn.
  if (typeof capNhatGoiYGia === 'function') capNhatGoiYGia();
}

async function reverseLookup(lat, lon) {
  try {
    const r = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`);
    return (await r.json()).result;
  } catch { return null; }
}

// ---- Ô nhập địa chỉ có gợi ý ----
function wireField(which) {
  const field = document.querySelector(`.field[data-point="${which}"]`);
  const input = field.querySelector('input');
  const list = field.querySelector('.suggestions');
  let timer = null;
  let seq = 0; // chống race: chỉ nhận kết quả của lần gõ mới nhất

  input.addEventListener('focus', () => { activeField = which; });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    points[which] = null; // gõ lại nghĩa là điểm cũ không còn giá trị
    const q = input.value.trim();
    if (q.length < 3) { list.hidden = true; return; }

    // Chờ 500ms sau khi ngừng gõ — tôn trọng giới hạn 1 req/giây của Nominatim
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (mySeq !== seq) return;
        renderSuggestions(list, data.results || [], which);
      } catch {
        if (mySeq === seq) list.hidden = true;
      }
    }, 500);
  });

  document.addEventListener('click', (e) => {
    if (!field.contains(e.target)) list.hidden = true;
  });
}

function renderSuggestions(list, results, which) {
  list.innerHTML = '';
  if (results.length === 0) { list.hidden = true; return; }
  for (const r of results) {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.className = 's-name';
    name.textContent = r.short;
    const full = document.createElement('div');
    full.className = 's-full';
    // Hiện đường + PHƯỜNG + tọa độ. Phường phân biệt các đoạn của cùng con đường.
    // Cấp QUẬN của OSM ở TPHCM sai nên không hiện.
    full.textContent = [r.street, r.ward, `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`]
      .filter(Boolean).join(' · ');
    li.append(name, full);
    li.addEventListener('click', () => { setPoint(which, r); list.hidden = true; });
    list.appendChild(li);
  }
  list.hidden = false;
}

map.on('click', async (e) => {
  // Cùng lý do như kéo marker: ở màn xem kết quả, bấm bản đồ mà đổi được điểm
  // đón thì chỉ là ảo giác — chuyến đã lưu rồi, DB không đổi theo.
  if (!choPhepChinhDiem) return;
  const { lat, lng } = e.latlng;
  if (!Geo.isInHCMC(lat, lng)) return;
  const found = await reverseLookup(lat, lng);
  setPoint(activeField, found || { label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lon: lng });
});

wireField('start');
wireField('end');

// ================= CHUYỂN MÀN =================
const views = {
  dang: document.getElementById('view-dang'),
  xong: document.getElementById('view-xong'),
  xem: document.getElementById('view-xem'),
};

function showView(ten) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== ten;
  document.querySelectorAll('.tab').forEach((t) => {
    // Màn "đăng xong" vẫn thuộc về tab "Đăng chuyến"
    const thuoc = ten === 'xong' ? 'dang' : ten;
    t.classList.toggle('is-active', t.dataset.view === thuoc);
  });

  // Chỉ màn ĐANG SOẠN mới được chỉnh điểm. Màn "xong" và "xem" thì chuyến
  // đã nằm trong DB, mọi thao tác kéo/bấm đều không có tác dụng thật.
  choPhepChinhDiem = ten === 'dang';
  capNhatQuyenKeo();
  // Con trỏ cũng phải phản ánh việc bản đồ có bấm chọn điểm được hay không
  document.getElementById('map').style.cursor = choPhepChinhDiem ? '' : 'grab';

  // Ở màn kết quả, hải cẩu của mình mang nhãn "Bạn" + to hơn để phân biệt với người khác
  nhanDiemToi = ten === 'xem' ? 'Bạn' : null;
  capNhatIconToi();
}
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => showView(t.dataset.view));
});

// ================= FORM ĐĂNG CHUYẾN =================
const TEN_NGAY = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };

// Mặc định T2–T6 vì đây là web dành cho người đi làm
const daysEl = document.getElementById('days');
for (const [so, ten] of Object.entries(TEN_NGAY)) {
  const label = document.createElement('label');
  label.className = 'day';
  label.innerHTML =
    `<input type="checkbox" value="${so}" ${Number(so) <= 6 ? 'checked' : ''}><span>${ten}</span>`;
  daysEl.appendChild(label);
}

const dinhDangTien = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const priceInput = document.getElementById('price');
const priceHint = document.getElementById('price-hint');
function capNhatGia() {
  const v = Number(priceInput.value);
  priceHint.textContent = Number.isFinite(v) && v > 0 ? dinhDangTien(v) + ' mỗi chuyến' : '';
}
priceInput.addEventListener('input', capNhatGia);
capNhatGia();

// ---- Loại xe & gợi ý giá ----
// Đơn giá KHÔNG khai ở đây — lấy từ /api/config để chỉ có một nguồn duy nhất
// (match.js). Giá trị dưới chỉ là phòng hờ nếu mạng lỗi, sẽ bị ghi đè ngay khi tải xong.
let DON_GIA = { bike: 5000, car: 8000 };
const TEN_LOAI_XE = { bike: 'xe máy', car: 'xe hơi' };

fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (cfg && cfg.DON_GIA) {
      DON_GIA = cfg.DON_GIA;
      capNhatGoiYGia(); // vẽ lại nếu người dùng đã chọn xong 2 điểm
    }
  })
  .catch(() => { /* giữ giá phòng hờ */ });

// Gợi ý tên xe phổ biến ở TPHCM, tách theo loại
const GOI_Y_XE = {
  bike: ['Wave', 'Vision', 'Air Blade', 'SH', 'SH Mode', 'Lead', 'Vario', 'Sirius',
         'Exciter', 'Winner', 'Jupiter', 'Grande', 'Janus', 'Vespa', 'VinFast Klara', 'VinFast Evo'],
  car: ['VinFast VF3', 'VinFast VF5', 'VinFast VF e34', 'Toyota Vios', 'Toyota Innova',
        'Toyota Veloz', 'Toyota Avanza', 'Honda City', 'Hyundai Accent', 'Kia Morning',
        'Kia Carnival', 'Mazda 3', 'Mitsubishi Xpander', 'Ford Everest'],
};

const khoiXe = document.getElementById('khoi-xe');
const khoiMongMuon = document.getElementById('khoi-mong-muon');
const modelInput = document.getElementById('vehicle-model');
const datalist = document.getElementById('goi-y-xe');
const goiYGia = document.getElementById('goi-y-gia');
const goiYGiaText = document.getElementById('goi-y-gia-text');

const laTaiXe = () => document.querySelector('input[name="role"]:checked').value === 'driver';
const loaiXeDangChon = () => document.querySelector('input[name="vehicle_type"]:checked').value;
const mongMuonDangChon = () => document.querySelector('input[name="want_type"]:checked').value;

/**
 * Loại xe dùng để tính giá gợi ý.
 * Tài xế: theo xe của mình. Người đi nhờ: theo mong muốn, "xe nào cũng được"
 * thì tính theo xe máy (rẻ hơn) để không ra con số cao quá thực tế.
 */
function loaiXeTinhGia() {
  if (laTaiXe()) return loaiXeDangChon();
  const mm = mongMuonDangChon();
  return mm === 'any' ? 'bike' : mm;
}

function capNhatDanhSachXe() {
  const ds = GOI_Y_XE[loaiXeDangChon()] || [];
  datalist.innerHTML = ds.map((x) => `<option value="${x}"></option>`).join('');
  modelInput.placeholder = loaiXeDangChon() === 'bike' ? 'VD: SH, Wave, Vision' : 'VD: Veloz, Innova, VF3';
}

/** Gợi ý giá = quãng đường × đơn giá, làm tròn 1.000đ. Chỉ hiện khi đã có 2 điểm. */
function capNhatGoiYGia() {
  if (!points.start || !points.end) { goiYGia.hidden = true; return; }
  const km = Geo.haversineKm(points.start.lat, points.start.lon, points.end.lat, points.end.lon);
  const loai = loaiXeTinhGia();
  const gia = Math.round((km * DON_GIA[loai]) / 1000) * 1000;
  goiYGiaText.innerHTML =
    `Gợi ý <b>${dinhDangTien(gia)}</b> — ${km.toFixed(1)} km × ` +
    `${DON_GIA[loai] / 1000}k/km (${TEN_LOAI_XE[loai]})`;
  goiYGia.dataset.gia = gia;
  goiYGia.hidden = false;
}

document.getElementById('btn-dung-gia').addEventListener('click', () => {
  priceInput.value = goiYGia.dataset.gia;
  capNhatGia();
});

/** Form đổi mặt theo vai trò: có xe thì khai xe, đi nhờ thì khai mong muốn. */
function capNhatTheoVaiTro() {
  const laTX = laTaiXe();
  khoiXe.hidden = !laTX;
  khoiMongMuon.hidden = laTX;

  // "Giờ tới nơi" mang nghĩa KHÁC theo vai:
  //  - Tài xế: giờ THƯỜNG NGÀY tới nơi → mốc dựng timeline để ghép đón khách giữa
  //    đường (nên khuyến khích nhập).
  //  - Khách: HẠN CHÓT tới nơi chấp nhận được → lọc tài xế kịp giờ.
  const nhan = document.getElementById('dropoff-label');
  const goiY = document.getElementById('dropoff-hint');
  if (laTX) {
    nhan.textContent = 'Giờ tới nơi';
    goiY.textContent = 'Nên nhập — giờ bạn THƯỜNG NGÀY tới nơi, để hệ thống ghép được khách đi cùng đường ở giữa tuyến (nhiều kết quả hơn).';
  } else {
    nhan.textContent = 'Tới nơi trước';
    goiY.textContent = 'Tuỳ chọn — trễ nhất mấy giờ bạn chấp nhận tới nơi, giúp lọc ra tài xế kịp giờ cho bạn.';
  }
  goiY.hidden = false;

  capNhatGoiYGia();
}

document.querySelectorAll('input[name="role"]').forEach((r) =>
  r.addEventListener('change', capNhatTheoVaiTro));
document.querySelectorAll('input[name="vehicle_type"]').forEach((r) =>
  r.addEventListener('change', () => {
    capNhatDanhSachXe();
    // Đổi loại xe thì tên xe cũ không còn đúng nữa
    modelInput.value = '';
    capNhatGoiYGia();
  }));
document.querySelectorAll('input[name="want_type"]').forEach((r) =>
  r.addEventListener('change', capNhatGoiYGia));

capNhatDanhSachXe();
capNhatTheoVaiTro();

// ================= CHỌN GIỜ (24h · phút 00/15/30/45) =================
// Giờ đón = 2 select giờ(00-23) + phút. Giờ tới nơi = 1 select các mốc 15'
// GIỚI HẠN trong khoảng (giờ đón, giờ đón + 2h] để tránh chọn nhầm range quá rộng.
const PHUT_MOC = ['00', '15', '30', '45'];
const hai = (n) => String(n).padStart(2, '0');
const pkH = document.getElementById('pickup-hour');
const pkM = document.getElementById('pickup-min');
const dropH = document.getElementById('dropoff-hour');
const dropM = document.getElementById('dropoff-min');
const pickupHidden = document.getElementById('pickup');
const dropoffHidden = document.getElementById('dropoff');

// Đổ giờ 00-23 và phút cho ô giờ đón, đặt mặc định 07:00
(function dungOChonGioDon() {
  for (let h = 0; h < 24; h++) pkH.add(new Option(hai(h), hai(h)));
  for (const m of PHUT_MOC) pkM.add(new Option(m, m));
  const [h0, m0] = (pickupHidden.value || '07:00').split(':');
  pkH.value = h0; pkM.value = PHUT_MOC.includes(m0) ? m0 : '00';
})();

function phutTuChuoi(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Các mốc 15' hợp lệ cho "giờ tới nơi": đúng trong khoảng (giờ đón, giờ đón + 2h].
function mocToiNoi() {
  const base = phutTuChuoi(pickupHidden.value);
  const ds = [];
  for (let t = base + 15; t <= base + 120 && t < 24 * 60; t += 15) ds.push(t);
  return ds;
}

// Dựng lại ô GIỜ (kèm ô PHÚT theo giờ đang chọn) mỗi khi giờ đón đổi.
// Ô giờ chỉ liệt kê các giờ nằm trong vòng 2 tiếng kể từ giờ đón.
function dungOToiNoi() {
  const cu = dropoffHidden.value;                       // "HH:MM" hoặc ""
  const gioCo = [...new Set(mocToiNoi().map((t) => hai(Math.floor(t / 60))))];

  dropH.innerHTML = '';
  dropH.add(new Option('--', ''));                      // "--" = không nhập (tuỳ chọn)
  for (const h of gioCo) dropH.add(new Option(h, h));

  const chH = cu.split(':')[0];
  dropH.value = gioCo.includes(chH) ? chH : '';
  napPhutToiNoi(cu);
}

// Ô PHÚT chỉ chứa các phút hợp lệ ứng với giờ đang chọn → không chọn ra ngoài khoảng.
function napPhutToiNoi(cu = '') {
  dropM.innerHTML = '';
  const h = dropH.value;
  if (!h) { dropoffHidden.value = ''; return; }
  const phut = mocToiNoi()
    .filter((t) => hai(Math.floor(t / 60)) === h)
    .map((t) => hai(t % 60));
  for (const m of phut) dropM.add(new Option(m, m));
  if (cu.split(':')[0] === h && phut.includes(cu.split(':')[1])) dropM.value = cu.split(':')[1];
  dongBoToiNoi();
}

function dongBoToiNoi() {
  dropoffHidden.value = dropH.value ? `${dropH.value}:${dropM.value}` : '';
}

function dongBoGioDon() {
  pickupHidden.value = `${pkH.value}:${pkM.value}`;
  dungOToiNoi();
}
pkH.addEventListener('change', dongBoGioDon);
pkM.addEventListener('change', dongBoGioDon);
dropH.addEventListener('change', () => napPhutToiNoi(dropoffHidden.value));
dropM.addEventListener('change', dongBoToiNoi);
dungOToiNoi();

const errBox = document.getElementById('form-errors');
function hienLoi(ds) {
  if (!ds.length) { errBox.hidden = true; return; }
  errBox.innerHTML = '<ul>' + ds.map((e) => `<li>${e}</li>`).join('') + '</ul>';
  errBox.hidden = false;
  errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('form-chuyen').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-dang');

  // Kiểm tra ngay ở client cho phản hồi nhanh — server vẫn kiểm lại lần nữa
  const loi = [];
  if (!points.start) loi.push('Chưa chọn điểm khởi hành');
  if (!points.end) loi.push('Chưa chọn điểm kết thúc');
  const days = [...daysEl.querySelectorAll('input:checked')].map((i) => Number(i.value));
  if (days.length === 0) loi.push('Chưa chọn ngày nào trong tuần');
  // Giờ tới nơi (nếu khai) phải sau giờ đón. Chuỗi "HH:MM" so sánh trực tiếp được.
  const gioDon = document.getElementById('pickup').value;
  const gioToi = document.getElementById('dropoff').value;
  if (gioDon && gioToi && gioToi <= gioDon) loi.push('Giờ tới nơi phải sau giờ đón');
  if (loi.length) return hienLoi(loi);

  const body = {
    role: document.querySelector('input[name="role"]:checked').value,
    name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value || null,
    note: document.getElementById('note').value || null,
    start_label: points.start.label,
    start_lat: points.start.lat,
    start_lon: points.start.lon,
    end_label: points.end.label,
    end_lat: points.end.lat,
    end_lon: points.end.lon,
    pickup: document.getElementById('pickup').value,
    dropoff: document.getElementById('dropoff').value || null,
    days: days.join(','),
    price: Number(priceInput.value) || 0,
    // Chỉ gửi trường đúng với vai trò
    vehicle_type: laTaiXe() ? loaiXeDangChon() : null,
    vehicle_model: laTaiXe() ? (modelInput.value.trim() || null) : null,
    want_type: laTaiXe() ? 'any' : mongMuonDangChon(),
  };

  btn.disabled = true;
  btn.textContent = 'Đang đăng…';
  try {
    const r = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return hienLoi(data.errors || [data.error || 'Có lỗi xảy ra']);

    errBox.hidden = true;
    document.getElementById('ma-cua-toi').textContent = data.code;
    const emailNote = document.getElementById('email-note');
    if (body.email) {
      emailNote.textContent = 'Bản chạy thử chưa gửi email thật — hãy tự lưu mã lại.';
      emailNote.hidden = false;
    }
    showView('xong');
  } catch (err) {
    hienLoi(['Không kết nối được máy chủ: ' + err.message]);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng chuyến';
  }
});

document.getElementById('btn-copy').addEventListener('click', async (e) => {
  const ma = document.getElementById('ma-cua-toi').textContent;
  try {
    await navigator.clipboard.writeText(ma);
    e.target.textContent = 'Đã sao chép';
    setTimeout(() => { e.target.textContent = 'Sao chép mã'; }, 1500);
  } catch {
    e.target.textContent = 'Hãy chép tay mã ở trên';
  }
});

document.getElementById('btn-xem-ngay').addEventListener('click', () => {
  document.getElementById('ma-input').value = document.getElementById('ma-cua-toi').textContent;
  // Người vừa đăng đã nhập sđt ở form -> điền sẵn để qua được cửa xác thực.
  document.getElementById('sdt-xem').value = document.getElementById('phone').value.trim();
  showView('xem');
  traCuu();
});

// ================= XEM KẾT QUẢ MATCH =================
const xemLoi = document.getElementById('xem-loi');
const boxToi = document.getElementById('chuyen-cua-toi');
const boxKq = document.getElementById('ket-qua');
let maHienTai = null;

document.getElementById('btn-tra').addEventListener('click', traCuu);
document.getElementById('ma-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') traCuu();
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function traCuu() {
  const ma = document.getElementById('ma-input').value.trim().toUpperCase();
  const sdt = document.getElementById('sdt-xem').value.trim();
  const thieu = [];
  if (!ma) thieu.push('mã đi chung');
  if (!sdt) thieu.push('số điện thoại');
  if (thieu.length) {
    boxKq.innerHTML = '';
    xemLoi.textContent = 'Vui lòng nhập ' + thieu.join(', ') + '.';
    xemLoi.hidden = false;
    return;
  }
  xemLoi.hidden = true;
  boxToi.innerHTML = '';
  boxKq.innerHTML = '<div class="empty">Đang tra…</div>';

  try {
    const q = '?phone=' + encodeURIComponent(sdt);
    const r = await fetch('/api/trips/' + encodeURIComponent(ma) + q);
    const data = await r.json();
    if (!r.ok) {
      boxKq.innerHTML = '';
      xemLoi.textContent = data.error || 'Không tra được';
      xemLoi.hidden = false;
      return;
    }
    maHienTai = ma;
    veChuyenCuaToi(data.me);
    veKetQua(data.matches, data.ganKhop || []);
  } catch (err) {
    boxKq.innerHTML = '';
    xemLoi.textContent = 'Không kết nối được máy chủ: ' + err.message;
    xemLoi.hidden = false;
  }
}

function veChuyenCuaToi(me) {
  const tenChao = esc((me.name || '').trim().split(/\s+/).slice(-1)[0] || 'bạn');
  boxToi.innerHTML =
    `<div class="chao-mung">
      <div class="chao-title">Xin chào ${tenChao} 👋</div>
      <p class="chao-sub">Đây là hành trình bạn đã đăng cùng những người có thể đi chung đường với bạn. Chúc bạn sớm tìm được bạn đồng hành nhé! 🛵</p>
    </div>
    <div class="my-trip">
      <div class="t">Chuyến của bạn — ${me.role === 'driver'
        ? 'Có xe' + (me.tenLoaiXe ? ` (${esc(me.tenLoaiXe)}${me.vehicle_model ? ' · ' + esc(me.vehicle_model) : ''})` : '')
        : 'Cần đi nhờ'}</div>
      ${esc(me.start_label)}<br>→ ${esc(me.end_label)}<br>
      Đón ${esc(me.pickup)} · ${esc(me.tenNgay)} · ${dinhDangTien(me.price)}
    </div>`;

  // Vẽ lại tuyến của mình lên bản đồ để đối chiếu trực quan
  if (typeof me.start_lat === 'number' && typeof me.end_lat === 'number') {
    setPoint('start', { label: me.start_label, lat: me.start_lat, lon: me.start_lon });
    setPoint('end', { label: me.end_label, lat: me.end_lat, lon: me.end_lon });
  }
}

// Lớp vẽ điểm của người khác — xoá sạch mỗi lần tra lại để không chồng chấm cũ
let lopMatch = null;
const chamMatch = new Map(); // id chuyến -> nhóm marker

function xoaChamMatch() {
  if (lopMatch) { map.removeLayer(lopMatch); lopMatch = null; }
  chamMatch.clear();
}

/**
 * Vẽ điểm đón/trả của từng người khớp lên bản đồ.
 * Chấm nhỏ, viền trắng — phân biệt với marker to của chính mình.
 */
function veChamMatch(matches) {
  xoaChamMatch();
  if (matches.length === 0) return;
  lopMatch = L.layerGroup().addTo(map);

  for (const m of matches) {
    if (!m.diem) continue;
    // Người "gần khớp" (có trường goiY) vẽ nhạt + nhỏ hơn để phân biệt với match thật.
    const laGanKhop = Boolean(m.goiY);
    // Gắn TÊN lên hải cẩu điểm đón để biết là của ai (khác "Bạn" của mình).
    // Điểm trả không lặp lại tên — đã nối bằng đường nét đứt nên vẫn rõ cặp.
    const tenNhan = m.name + (laGanKhop ? ' · gần khớp' : '');
    const mkDon = L.marker(m.diem.start, { icon: sealIcon('blue', tenNhan, { faded: laGanKhop }) })
      .bindTooltip(`${esc(m.name)} — điểm đón`, { direction: 'top' });
    const mkTra = L.marker(m.diem.end, { icon: sealIcon('pink', null, { faded: laGanKhop }) })
      .bindTooltip(`${esc(m.name)} — điểm trả`, { direction: 'top' });
    mkDon.addTo(lopMatch);
    mkTra.addTo(lopMatch);
    // Nối điểm đón với điểm trả để nhìn ra hướng đi của họ
    const noi = L.polyline([m.diem.start, m.diem.end], {
      color: '#c98fae', weight: 3, opacity: laGanKhop ? 0.4 : 0.65, dashArray: '4, 6',
    });
    noi.addTo(lopMatch);
    chamMatch.set(m.id, [mkDon, mkTra, noi]);
  }
}

/** Bấm vào thẻ thì phóng bản đồ tới chuyến đó và làm nổi chấm lên. */
function noiBatMatch(id) {
  const nhom = chamMatch.get(id);
  if (!nhom) return;
  const diemCuaHo = nhom.filter((x) => x.getLatLng).map((x) => x.getLatLng());
  const diemCuaToi = [points.start, points.end].filter(Boolean).map((p) => [p.lat, p.lon]);
  map.fitBounds(L.latLngBounds([...diemCuaHo, ...diemCuaToi]), { padding: [50, 50] });

  // Nảy hải cẩu vừa chọn lên cho mắt bắt được (animate lớp .seal-inner bên trong,
  // KHÔNG đụng transform mà Leaflet đặt trên _icon để không lệch vị trí).
  for (const c of nhom) {
    if (!c._icon) continue; // bỏ qua đường polyline
    const inner = c._icon.querySelector('.seal-inner');
    if (!inner) continue;
    c.setZIndexOffset(1000);
    inner.classList.add('pop');
    setTimeout(() => { inner.classList.remove('pop'); c.setZIndexOffset(0); }, 900);
  }
}

function veKetQua(matches, ganKhop) {
  // Vẽ cả hai nhóm lên bản đồ để nhìn được bức tranh đầy đủ
  veChamMatch([...matches, ...ganKhop]);

  let html = '';

  if (matches.length === 0) {
    html += `<div class="empty">Chưa có ai khớp hoàn toàn.<br>
       Chuyến của bạn vẫn đang được lưu — quay lại bằng mã này sau nhé.</div>`;
  } else {
    const soHaiChieu = matches.filter((m) => m.haiChieu).length;
    html +=
      `<div class="count">${matches.length} người phù hợp` +
      (soHaiChieu ? ` · <b>${soHaiChieu} đã match hai chiều</b>` : '') + `</div>` +
      matches.map(theCard).join('');
  }

  // Mục "Gần khớp" — người trượt đúng 1 tiêu chí. Không bấm quan tâm được,
  // mục đích là cho người dùng thấy cơ hội đang nằm ở đâu để tự điều chỉnh.
  if (ganKhop.length > 0) {
    html +=
      `<div class="gan-khop-title">Gần khớp — chỉ lệch một chút</div>
       <p class="micro" style="margin:0 0 10px">Chưa ghép được, nhưng nếu bạn chỉnh lại
       một chút thì có thể đi chung với những người này.</p>` +
      ganKhop.map(theCardGanKhop).join('');
  }

  boxKq.innerHTML = html;

  boxKq.querySelectorAll('[data-quan-tam]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // bấm nút thì đừng kích hoạt luôn việc phóng bản đồ
      bamQuanTam(Number(btn.dataset.quanTam), btn);
    });
  });
  boxKq.querySelectorAll('[data-id]').forEach((the) => {
    the.addEventListener('click', () => noiBatMatch(Number(the.dataset.id)));
  });
}

/** Dòng mô tả xe trên thẻ kết quả. Kèm cảnh báo nếu lệch mong muốn của mình. */
function moTaXe(m) {
  if (m.role === 'driver' && m.tenLoaiXe) {
    const ten = m.vehicle_model ? `${m.tenLoaiXe} · ${esc(m.vehicle_model)}` : m.tenLoaiXe;
    const canhBao = m.lechLoaiXe
      ? ` <span style="color:#96631a">(khác loại bạn mong muốn)</span>` : '';
    return `<b>${esc(ten)}</b>${canhBao}<br>`;
  }
  // Người đi nhờ: hiện mong muốn nếu họ có nêu
  if (m.role === 'rider' && m.want_type && m.want_type !== 'any') {
    return `Muốn đi <b>${m.want_type === 'car' ? 'xe hơi' : 'xe máy'}</b><br>`;
  }
  return '';
}

function theCard(m) {
  let trangThai = '';
  if (m.haiChieu) {
    trangThai =
      `<div class="badge badge-ok">Đã match hai chiều</div>
       <div class="contact">
         <b>${esc(m.name)}</b><br>
         Điện thoại: <a href="tel:${esc(m.lienHe.phone)}">${esc(m.lienHe.phone)}</a>
         ${m.lienHe.email ? `<br>Email: ${esc(m.lienHe.email)}` : ''}
         <br><span class="micro">Hai bên tự trao đổi và thống nhất giá nhé.</span>
       </div>`;
  } else if (m.toiQuanTam) {
    trangThai =
      `<div class="badge badge-wait">Đang chờ họ đồng ý</div>
       <div class="card-actions"><button class="btn btn-ghost btn-small" disabled>Đã bày tỏ quan tâm</button></div>`;
  } else {
    trangThai =
      (m.hoQuanTam ? `<div class="badge badge-wait">Họ đã quan tâm bạn</div>` : '') +
      `<div class="card-actions">
         <button class="btn btn-primary btn-small" data-quan-tam="${m.id}">Quan tâm</button>
       </div>`;
  }

  return `
    <div class="card ${m.haiChieu ? 'is-matched' : ''}" data-id="${m.id}" title="Bấm để xem trên bản đồ">
      <div class="card-top">
        <span class="card-name">${esc(m.name)} · ${m.role === 'driver' ? 'Có xe' : 'Cần đi nhờ'}</span>
        <span class="card-price">${dinhDangTien(m.price)}</span>
      </div>
      <div class="card-line">
        ${moTaXe(m)}
        ${m.cachKhop === 'don-tuyen' && m.donGiuaDuong
          ? `<b style="color:#0f8a5f">Đón giữa đường</b> — bạn ra điểm đón cách <b>${m.donGiuaDuong.kmToiDiemDon} km</b><br>` +
            `Tài xế ngang qua đón bạn lúc <b>${esc(m.donGiuaDuong.gioDon)}</b> ` +
            `(lệch ${m.donGiuaDuong.lechDonPhut} phút so với giờ bạn muốn)<br>` +
            `Tới nơi khoảng <b>${esc(m.donGiuaDuong.gioTra)}</b> · <b>${esc(m.ngayChung)}</b>`
          : (m.xuongDocDuong
              ? `Khởi hành cách bạn <b>${m.kmDau} km</b><br>` +
                `<b style="color:#0f8a5f">Cùng đường đi</b> — ` +
                (m.cachKhop === 'tren-tuyen'
                  ? `điểm đến nằm cách tuyến họ chạy ${m.kmToiTuyen} km`
                  : `điểm đến nằm dọc hướng họ đi`) + `<br>`
              : `Khởi hành cách bạn <b>${m.kmDau} km</b> · kết thúc cách <b>${m.kmCuoi} km</b><br>`) +
            `Đón <b>${esc(m.pickup)}</b> (lệch ${m.lechPhut} phút) · <b>${esc(m.ngayChung)}</b>`}
        ${m.note ? `<br>“${esc(m.note)}”` : ''}
      </div>
      ${trangThai}
    </div>`;
}

/** Thẻ cho người "gần khớp" — nhạt hơn, không có nút, nói rõ lệch chỗ nào. */
function theCardGanKhop(g) {
  return `
    <div class="card card-gan" data-id="${g.id}" title="Bấm để xem trên bản đồ">
      <div class="card-top">
        <span class="card-name">${esc(g.name)} · ${g.role === 'driver' ? 'Có xe' : 'Cần đi nhờ'}</span>
        <span class="card-price">${dinhDangTien(g.price)}</span>
      </div>
      <div class="card-line">
        ${moTaXe(g)}
        Đón <b>${esc(g.pickup)}</b> · <b>${esc(g.tenNgay)}</b>
        ${g.note ? `<br>“${esc(g.note)}”` : ''}
      </div>
      <div class="thieu">${esc(g.goiY)}</div>
    </div>`;
}

async function bamQuanTam(targetId, btn) {
  btn.disabled = true;
  btn.textContent = 'Đang gửi…';
  try {
    const r = await fetch('/api/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: maHienTai, targetId }),
    });
    const data = await r.json();
    if (!r.ok) {
      btn.disabled = false;
      btn.textContent = 'Quan tâm';
      xemLoi.textContent = data.error || 'Không gửi được';
      xemLoi.hidden = false;
      return;
    }
    traCuu(); // vẽ lại để cập nhật trạng thái
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Quan tâm';
    xemLoi.textContent = 'Lỗi: ' + err.message;
    xemLoi.hidden = false;
  }
}
