// seed_50.js — Nạp 50 chuyến mẫu ở TPHCM vào DB để thử nghiệm luật ghép.
//
// Vì sao dữ liệu viết tay chứ không random hay geocode:
//  - Sandbox không ra được Nominatim, nên toạ độ lấy từ điểm mốc quen thuộc
//    của TPHCM (sai số vài chục mét — thừa đủ cho ngưỡng 2km của match.js).
//  - Random thuần sẽ ra gần như 0 match, không kiểm chứng được gì. Ở đây có
//    10 cặp CỐ Ý khớp + 4 cặp CỐ Ý gần khớp + phần còn lại làm nhiễu.
//
// Chạy:  node seed_50.js            -> thêm 50 chuyến vào DB hiện tại
//        node seed_50.js --reset    -> xoá sạch trips/interests rồi mới nạp
//        SYB_DB=thu.db node seed_50.js   -> nạp sang DB khác, không đụng dữ liệu thật

const { client, sanSang, taoChuyen, layTatCa } = require('./db.js');
const { haversineKm } = require('./geo.js');
const { xetCap, giaKhuyenNghi } = require('./match.js');

// ---------------------------------------------------------------------------
// Mỗi dòng: [tên, sđt, vai, điểm đi(label,lat,lon), điểm đến(label,lat,lon),
//            giờ đón, ngày trong tuần, loại xe / mong muốn, tên xe]
// role: 'driver' = có xe | 'rider' = cần đi nhờ
// days: 2=T2 ... 7=T7, 8=CN
// ---------------------------------------------------------------------------

const D = (name, phone, from, to, pickup, days, vehicle_type, vehicle_model) =>
  ({ role: 'driver', name, phone, from, to, pickup, days, vehicle_type, vehicle_model });
const R = (name, phone, from, to, pickup, days, want_type = 'any') =>
  ({ role: 'rider', name, phone, from, to, pickup, days, want_type });

const CHUYEN = [
  // ===== NHÓM 1..10: mỗi nhóm 1 người có xe + 1 người đi nhờ, CỐ Ý khớp =====

  // 1. Gò Vấp -> Quận 1 (trục Nguyễn Kiệm – Nguyễn Văn Trỗi)
  D('Nguyễn Văn Bình', '0903112458',
    ['412 Quang Trung, Phường 10, Gò Vấp', 10.8380, 106.6660],
    ['72 Nguyễn Huệ, Phường Bến Nghé, Quận 1', 10.7740, 106.7040],
    '07:00', '2,3,4,5,6', 'bike', 'Honda SH 150i'),
  R('Trần Thị Mỹ Duyên', '0356874120',
    ['145 Lê Đức Thọ, Phường 17, Gò Vấp', 10.8412, 106.6720],
    ['135 Hàm Nghi, Phường Bến Thành, Quận 1', 10.7712, 106.6975],
    '07:10', '2,4,6', 'bike'),

  // 2. Thủ Đức -> Quận 1 (Xa lộ Hà Nội)
  D('Lê Hoàng Nam', '0912447803',
    ['58 Võ Văn Ngân, Phường Linh Chiểu, Thủ Đức', 10.8500, 106.7600],
    ['02 Tôn Đức Thắng, Phường Bến Nghé, Quận 1', 10.7855, 106.7075],
    '06:45', '2,3,4,5,6', 'car', 'Toyota Vios'),
  R('Phạm Quốc Huy', '0778230514',
    ['21 Đặng Văn Bi, Phường Bình Thọ, Thủ Đức', 10.8480, 106.7530],
    ['37 Tôn Đức Thắng, Phường Bến Nghé, Quận 1', 10.7880, 106.7060],
    '06:55', '2,3,4,5,6', 'car'),

  // 3. Bình Thạnh -> Phú Mỹ Hưng Quận 7
  D('Đặng Minh Trí', '0938605271',
    ['203 Xô Viết Nghệ Tĩnh, Phường 26, Bình Thạnh', 10.8040, 106.7080],
    ['1050 Nguyễn Văn Linh, Phường Tân Phong, Quận 7', 10.7290, 106.7180],
    '07:15', '2,3,4,5,6', 'car', 'Mazda CX-5'),
  R('Vũ Thị Ngọc Anh', '0345789061',
    ['88 Ung Văn Khiêm, Phường 25, Bình Thạnh', 10.8080, 106.7160],
    ['15 Nguyễn Đức Cảnh, Phường Tân Phong, Quận 7', 10.7255, 106.7200],
    '07:20', '2,4,6', 'car'),

  // 4. Tân Bình -> Quận 3
  D('Hoàng Anh Tuấn', '0907338914',
    ['196 Cộng Hòa, Phường 13, Tân Bình', 10.8020, 106.6480],
    ['265 Võ Văn Tần, Phường 5, Quận 3', 10.7770, 106.6890],
    '07:30', '2,3,4,5,6', 'bike', 'Yamaha Exciter 155'),
  R('Bùi Thị Thu Hà', '0369015477',
    ['31 Hoàng Hoa Thám, Phường 13, Tân Bình', 10.7995, 106.6520],
    ['180 Nguyễn Đình Chiểu, Phường 6, Quận 3', 10.7815, 106.6900],
    '07:35', '2,3,5,6', 'bike'),

  // 5. Quận 7 -> Quận 1 (qua cầu Kênh Tẻ)
  D('Trương Công Định', '0965204813',
    ['470 Nguyễn Thị Thập, Phường Tân Quy, Quận 7', 10.7400, 106.7050],
    ['26 Lê Lợi, Phường Bến Thành, Quận 1', 10.7730, 106.7000],
    '07:05', '2,3,4,5,6', 'bike', 'Honda Air Blade'),
  R('Nguyễn Thị Kim Chi', '0332648095',
    ['12 Lâm Văn Bền, Phường Tân Kiểng, Quận 7', 10.7455, 106.7100],
    ['92 Nguyễn Du, Phường Bến Nghé, Quận 1', 10.7790, 106.6975],
    '07:00', '2,3,4,5,6', 'any'),

  // 6. Bình Tân -> Quận 5
  D('Phan Thanh Sơn', '0917582306',
    ['617 Kinh Dương Vương, Phường An Lạc, Bình Tân', 10.7450, 106.6180],
    ['340 Nguyễn Trãi, Phường 8, Quận 5', 10.7550, 106.6720],
    '06:50', '2,3,4,5,6,7', 'bike', 'Honda Vision'),
  R('Lâm Thị Bảo Trâm', '0705194762',
    ['24 Tên Lửa, Phường Bình Trị Đông B, Bình Tân', 10.7420, 106.6100],
    ['215 Trần Hưng Đạo, Phường 7, Quận 5', 10.7530, 106.6680],
    '07:00', '3,5,7', 'bike'),

  // 7. Quận 12 -> Tân Bình
  D('Đỗ Văn Khoa', '0946117238',
    ['118 Nguyễn Văn Quá, Phường Đông Hưng Thuận, Quận 12', 10.8480, 106.6320],
    ['455 Trường Chinh, Phường 14, Tân Bình', 10.8060, 106.6350],
    '07:20', '2,3,4,5,6', 'bike', 'Honda Wave Alpha'),
  R('Ngô Thị Hồng Loan', '0387246019',
    ['77 Tô Ký, Phường Tân Chánh Hiệp, Quận 12', 10.8560, 106.6280],
    ['12 Âu Cơ, Phường 14, Tân Bình', 10.8000, 106.6395],
    '07:25', '2,4,6', 'any'),

  // 8. Thủ Đức (Lê Văn Việt) -> Thảo Điền
  D('Huỳnh Tấn Lộc', '0932865147',
    ['160 Lê Văn Việt, Phường Hiệp Phú, Thủ Đức', 10.8460, 106.7830],
    ['41 Quốc Hương, Phường Thảo Điền, Thủ Đức', 10.8060, 106.7350],
    '07:40', '2,3,4,5,6', 'car', 'Kia Seltos'),
  R('Trần Nhật Minh', '0764038215',
    ['9 Đỗ Xuân Hợp, Phường Phước Long B, Thủ Đức', 10.8330, 106.7760],
    ['62 Xuân Thủy, Phường Thảo Điền, Thủ Đức', 10.8035, 106.7330],
    '07:45', '2,3,4,5,6', 'any'),

  // 9. Quận 10 -> Phú Nhuận
  D('Cao Thị Lệ Quyên', '0928471530',
    ['11 Sư Vạn Hạnh, Phường 12, Quận 10', 10.7710, 106.6690],
    ['203 Hoàng Văn Thụ, Phường 8, Phú Nhuận', 10.8010, 106.6720],
    '08:00', '3,5,7', 'bike', 'Vespa Sprint'),
  R('Nguyễn Đức Toàn', '0398150467',
    ['15 Ba Tháng Hai, Phường 12, Quận 10', 10.7720, 106.6680],
    ['118 Nguyễn Kiệm, Phường 3, Phú Nhuận', 10.8130, 106.6790],
    '08:05', '3,4,5,7', 'bike'),

  // 10. Nhà Bè -> Quận 4
  D('Võ Thành Đạt', '0908734162',
    ['307 Lê Văn Lương, Thị trấn Nhà Bè, huyện Nhà Bè', 10.6950, 106.7100],
    ['128 Bến Vân Đồn, Phường 6, Quận 4', 10.7590, 106.6950],
    '06:30', '2,3,4,5,6', 'car', 'Hyundai Accent'),
  R('Đinh Thị Phương Thảo', '0372590814',
    ['45 Nguyễn Bình, xã Phú Xuân, huyện Nhà Bè', 10.7040, 106.7150],
    ['19 Hoàng Diệu, Phường 12, Quận 4', 10.7615, 106.7005],
    '06:40', '2,3,4,5,6', 'car'),

  // ===== 11..12: CỐ Ý "gần khớp" — cùng tuyến nhưng lệch giờ nhiều =====

  // 11. Tân Phú -> Quận 1: tài xế đi sớm, khách đi trễ 50 phút
  D('Nguyễn Hữu Phước', '0919043726',
    ['312 Lũy Bán Bích, Phường Hòa Thạnh, Tân Phú', 10.7830, 106.6300],
    ['5 Lê Duẩn, Phường Bến Nghé, Quận 1', 10.7815, 106.6995],
    '06:30', '2,3,4,5,6', 'bike', 'Honda Winner X'),
  R('Lý Gia Bảo', '0764912850',
    ['87 Âu Cơ, Phường Tân Thành, Tân Phú', 10.7860, 106.6400],
    ['15 Pasteur, Phường Bến Nghé, Quận 1', 10.7800, 106.7020],
    '07:20', '2,3,4,5,6', 'bike'),

  // 12. Quận 8 -> Quận 1: cùng giờ nhưng điểm đi cách ~3km (ngoài bán kính 2km)
  D('Trịnh Văn Hiếu', '0977351048',
    ['620 Phạm Thế Hiển, Phường 4, Quận 8', 10.7380, 106.6720],
    ['110 Nguyễn Thị Minh Khai, Phường 6, Quận 3', 10.7790, 106.6905],
    '07:10', '2,3,4,5,6', 'bike', 'Yamaha Janus'),
  R('Mai Thị Thanh Tuyền', '0345012867',
    ['9 Tạ Quang Bửu, Phường 5, Quận 8', 10.7370, 106.6480],
    ['48 Cách Mạng Tháng Tám, Phường 6, Quận 3', 10.7820, 106.6870],
    '07:15', '2,3,4,5,6', 'any'),

  // ===== 13..25: dữ liệu nhiễu, rải khắp thành phố =====

  D('Nguyễn Trọng Nghĩa', '0902558147',
    ['88 Phan Xích Long, Phường 2, Phú Nhuận', 10.7990, 106.6870],
    ['1 Nguyễn Văn Cừ, Phường 4, Quận 5', 10.7620, 106.6820],
    '17:30', '2,3,4,5,6', 'bike', 'Honda Lead'),
  R('Hà Thị Mộng Cầm', '0367420159',
    ['205 Nguyễn Kiệm, Phường 3, Phú Nhuận', 10.8130, 106.6790],
    ['475 An Dương Vương, Phường 4, Quận 5', 10.7580, 106.6620],
    '17:35', '2,4,6', 'any'),

  D('Bùi Quang Vinh', '0983207614',
    ['66 Hà Huy Giáp, Phường Thạnh Lộc, Quận 12', 10.8580, 106.6820],
    ['33 Phạm Văn Đồng, Phường 1, Gò Vấp', 10.8330, 106.6960],
    '07:50', '2,3,4,5,6', 'car', 'Ford EcoSport'),
  R('Tôn Nữ Quỳnh Như', '0325981470',
    ['14 Nguyễn Ảnh Thủ, Phường Trung Mỹ Tây, Quận 12', 10.8630, 106.6220],
    ['210 Nguyễn Oanh, Phường 17, Gò Vấp', 10.8380, 106.6800],
    '07:55', '3,5,7', 'bike'),

  D('Phạm Ngọc Hải', '0931744026',
    ['150 Nguyễn Duy Trinh, Phường Bình Trưng Đông, Thủ Đức', 10.7900, 106.7830],
    ['720 Mai Chí Thọ, Phường An Lợi Đông, Thủ Đức', 10.7810, 106.7280],
    '08:15', '2,4,6', 'bike', 'Honda SH Mode'),
  R('Lê Thị Bích Ngân', '0705362819',
    ['3 Lương Định Của, Phường An Phú, Thủ Đức', 10.7880, 106.7420],
    ['200 Tôn Đức Thắng, Phường Bến Nghé, Quận 1', 10.7860, 106.7070],
    '08:20', '2,4,6', 'any'),

  D('Trần Đăng Khôi', '0945870231',
    ['58 Hậu Giang, Phường 11, Quận 6', 10.7480, 106.6350],
    ['12 Lý Thường Kiệt, Phường 7, Tân Bình', 10.7850, 106.6520],
    '06:55', '2,3,4,5,6', 'bike', 'Suzuki Raider'),
  R('Nguyễn Thị Ánh Tuyết', '0388214760',
    ['74 Bình Tây, Phường 2, Quận 6', 10.7495, 106.6510],
    ['520 Lạc Long Quân, Phường 5, Quận 11', 10.7790, 106.6420],
    '07:05', '2,3,4,5,6', 'bike'),

  D('Dương Chí Thành', '0961038475',
    ['92 Trần Đại Nghĩa, xã Tân Kiên, Bình Chánh', 10.7100, 106.5850],
    ['501 Kinh Dương Vương, Phường An Lạc, Bình Tân', 10.7450, 106.6180],
    '06:20', '2,3,4,5,6,7', 'car', 'Mitsubishi Xpander'),
  R('Phùng Thị Kiều Oanh', '0356701924',
    ['18 Nguyễn Văn Linh, xã Bình Hưng, Bình Chánh', 10.7230, 106.6350],
    ['65 Nguyễn Thị Thập, Phường Tân Quy, Quận 7', 10.7400, 106.7050],
    '06:25', '2,3,4,5,6', 'any'),

  D('Nguyễn Bá Lộc', '0908261573',
    ['27 Nguyễn Xí, Phường 13, Bình Thạnh', 10.8180, 106.7080],
    ['144 Nguyễn Trãi, Phường Bến Thành, Quận 1', 10.7690, 106.6930],
    '07:35', '3,5,7', 'bike', 'Honda Vario'),
  R('Trần Thị Diễm My', '0397548012',
    ['61 Phan Văn Trị, Phường 11, Bình Thạnh', 10.8280, 106.6890],
    ['90 Điện Biên Phủ, Phường Đa Kao, Quận 1', 10.7885, 106.6950],
    '07:45', '3,5', 'bike'),

  D('Lưu Minh Quân', '0973164820',
    ['135 Tân Kỳ Tân Quý, Phường Sơn Kỳ, Tân Phú', 10.8000, 106.6180],
    ['7 Trường Sơn, Phường 2, Tân Bình', 10.8125, 106.6640],
    '05:40', '2,3,4,5,6,7,8', 'car', 'Toyota Innova'),
  R('Đoàn Thị Hải Yến', '0764285093',
    ['52 Gò Dầu, Phường Tân Quý, Tân Phú', 10.8020, 106.6240],
    ['1 Bạch Đằng, Phường 2, Tân Bình', 10.8080, 106.6660],
    '05:50', '2,4,6,8', 'any'),

  D('Nguyễn Hoàng Long', '0919625470',
    ['210 Huỳnh Tấn Phát, Phường Tân Thuận Đông, Quận 7', 10.7480, 106.7280],
    ['64 Khánh Hội, Phường 5, Quận 4', 10.7570, 106.7000],
    '16:45', '2,3,4,5,6', 'bike', 'Honda Future'),
  R('Võ Thị Thúy Kiều', '0348051726',
    ['31 Nguyễn Tất Thành, Phường 13, Quận 4', 10.7620, 106.7060],
    ['1010 Nguyễn Văn Linh, Phường Tân Phong, Quận 7', 10.7290, 106.7180],
    '17:00', '2,3,4,5,6', 'any'),

  D('Trần Văn Hậu', '0902847136',
    ['5 Kha Vạn Cân, Phường Linh Đông, Thủ Đức', 10.8380, 106.7480],
    ['268 Lý Thường Kiệt, Phường 14, Quận 10', 10.7720, 106.6580],
    '06:10', '2,4,6', 'car', 'Honda City'),
  R('Nguyễn Thị Cẩm Vân', '0378460215',
    ['19 Phạm Văn Đồng, Phường Hiệp Bình Chánh, Thủ Đức', 10.8290, 106.7250],
    ['3 Tháng 2, Phường 12, Quận 10', 10.7720, 106.6680],
    '06:20', '2,4,6', 'any'),

  D('Lê Quang Vinh', '0938470162',
    ['77 Lê Văn Sỹ, Phường 13, Quận 3', 10.7930, 106.6790],
    ['80 Nguyễn Văn Linh, Phường Tân Phong, Quận 7', 10.7295, 106.7175],
    '07:25', '2,3,4,5,6', 'bike', 'Yamaha NVX'),
  R('Phạm Thị Thanh Trúc', '0357193048',
    ['142 Trần Quang Diệu, Phường 14, Quận 3', 10.7885, 106.6790],
    ['12 Tân Trào, Phường Tân Phú, Quận 7', 10.7240, 106.7190],
    '07:55', '2,3,4,5,6', 'car'),

  D('Nguyễn Thanh Tùng', '0967812345',
    ['300 Xa lộ Hà Nội, Phường Linh Trung, Thủ Đức', 10.8700, 106.8020],
    ['15 Điện Biên Phủ, Phường 25, Bình Thạnh', 10.8010, 106.7130],
    '06:40', '2,3,4,5,6', 'bike', 'Honda Blade'),
  R('Trịnh Thị Ngọc Hân', '0703581462',
    ['22 Hoàng Diệu 2, Phường Linh Chiểu, Thủ Đức', 10.8520, 106.7660],
    ['210 Nguyễn Xí, Phường 13, Bình Thạnh', 10.8185, 106.7060],
    '06:50', '3,5,7', 'any'),

  D('Đặng Thị Hồng Nhung', '0912305874',
    ['40 Nguyễn Văn Nghi, Phường 7, Gò Vấp', 10.8290, 106.6790],
    ['58 Cộng Hòa, Phường 4, Tân Bình', 10.7995, 106.6540],
    '08:30', '7,8', 'bike', 'Honda Vision'),
  R('Bùi Xuân Trường', '0345867210',
    ['66 Thống Nhất, Phường 11, Gò Vấp', 10.8420, 106.6540],
    ['91 Trường Chinh, Phường 12, Tân Bình', 10.8035, 106.6420],
    '08:40', '7,8', 'bike'),

  // Cặp dài nhất bộ dữ liệu (~19km) — kiểm tra cận trên 20km
  D('Nguyễn Văn Đại', '0903674185',
    ['221 An Dương Vương, Phường 3, Quận 5', 10.7565, 106.6650],
    ['Khu Công nghệ cao, Xa lộ Hà Nội, Phường Linh Trung, Thủ Đức', 10.8695, 106.8010],
    '06:00', '2,3,4,5,6', 'car', 'Toyota Fortuner'),
  R('Huỳnh Thị Tuyết Mai', '0327840591',
    ['64 Nguyễn Chí Thanh, Phường 3, Quận 5', 10.7590, 106.6620],
    ['1 Võ Văn Ngân, Phường Linh Chiểu, Thủ Đức', 10.8505, 106.7610],
    '06:10', '2,3,4,5,6', 'any'),
];

// ---------------------------------------------------------------------------
// Kiểm tra + nạp
// ---------------------------------------------------------------------------

const phutSang = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
const gioTu = (p) => `${String(Math.floor(p / 60) % 24).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;

function chuanBi(c) {
  const km = haversineKm(c.from[1], c.from[2], c.to[1], c.to[2]);
  // Giờ tới = giờ đón + thời gian chạy ước tính (trung bình 18km/h giờ cao điểm) + 8 phút đệm
  const dropoff = gioTu(phutSang(c.pickup) + Math.round((km / 18) * 60) + 8);
  const loaiTinhGia = c.role === 'driver' ? c.vehicle_type : (c.want_type === 'car' ? 'car' : 'bike');
  return {
    role: c.role,
    name: c.name,
    phone: c.phone,
    email: null,
    start_label: c.from[0], start_lat: c.from[1], start_lon: c.from[2],
    end_label: c.to[0], end_lat: c.to[1], end_lon: c.to[2],
    pickup: c.pickup,
    dropoff,
    days: c.days,
    price: giaKhuyenNghi(km, loaiTinhGia),
    note: 'Dữ liệu mẫu để thử nghiệm',
    vehicle_type: c.vehicle_type || null,
    vehicle_model: c.vehicle_model || null,
    want_type: c.want_type || 'any',
    _km: km,
  };
}

async function main() {
  await sanSang();
  const reset = process.argv.includes('--reset');
  if (reset) {
    await client.executeMultiple('DELETE FROM interests; DELETE FROM trips;');
    console.log('Đã xoá sạch dữ liệu cũ.');
  }

  const rows = CHUYEN.map(chuanBi);

  // --- Kiểm tra trước khi ghi: quãng đường trong 3–20km, sđt và tên không trùng
  let loi = 0;
  const sdt = new Set(), ten = new Set();
  for (const r of rows) {
    if (r._km < 3 || r._km > 20) {
      console.log(`  ! ${r.name}: quãng đường ${r._km.toFixed(1)} km — NGOÀI khoảng 3–20km`);
      loi++;
    }
    if (sdt.has(r.phone)) { console.log(`  ! SĐT trùng: ${r.phone}`); loi++; }
    if (ten.has(r.name)) { console.log(`  ! Tên trùng: ${r.name}`); loi++; }
    if (!/^0\d{9}$/.test(r.phone)) { console.log(`  ! SĐT sai định dạng: ${r.phone}`); loi++; }
    sdt.add(r.phone); ten.add(r.name);
  }
  const soDriver = rows.filter((r) => r.role === 'driver').length;
  const soRider = rows.length - soDriver;
  if (rows.length !== 50 || soDriver !== 25 || soRider !== 25) {
    console.log(`  ! Sai số lượng: tổng ${rows.length}, có xe ${soDriver}, đi nhờ ${soRider}`);
    loi++;
  }
  if (loi > 0) {
    console.log(`\nDừng lại: ${loi} lỗi trong bộ dữ liệu, chưa ghi gì vào DB.`);
    process.exit(1);
  }

  // --- Ghi vào DB (tuần tự để mã sinh ra không đụng nhau)
  const daTao = [];
  for (const r of rows) {
    const { _km, ...t } = r;
    daTao.push({ ...(await taoChuyen(t)), _km });
  }

  console.log(`Đã nạp ${daTao.length} chuyến (${soDriver} có xe, ${soRider} cần đi nhờ).`);
  console.log(`Quãng đường: ${Math.min(...rows.map((r) => r._km)).toFixed(1)}–${Math.max(...rows.map((r) => r._km)).toFixed(1)} km\n`);

  // --- Đếm số cặp khớp thực tế theo đúng luật đang chạy
  const tatCa = await layTatCa();
  const capKhop = [];
  for (let i = 0; i < tatCa.length; i++) {
    for (let j = i + 1; j < tatCa.length; j++) {
      const kq = xetCap(tatCa[i], tatCa[j]);
      if (kq.khop) capKhop.push([tatCa[i], tatCa[j], kq]);
    }
  }
  console.log(`Luật ghép hiện tại tìm ra ${capKhop.length} cặp khớp:`);
  capKhop
    .sort((a, b) => a[2].diem - b[2].diem)
    .forEach(([a, b, k]) => {
      const tx = a.role === 'driver' ? a : b, kh = a.role === 'driver' ? b : a;
      console.log(
        `  ${tx.name} (xe) + ${kh.name} — đầu ${k.kmDau.toFixed(2)}km, cuối ${k.kmCuoi.toFixed(2)}km, ` +
        `lệch ${k.lechPhut}p, ngày ${k.tenNgay}, khớp nhờ ${k.cachKhop}`,
      );
    });
}

main().catch((e) => { console.error(e); process.exit(1); });
