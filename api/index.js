// Điểm vào cho Vercel (serverless). Vercel gọi hàm này cho mỗi request tới
// /api/* và /geo.js (theo rewrites trong vercel.json). Toàn bộ logic nằm ở
// server.js — ở đây chỉ nạp handler thuần và chuyển tiếp.
const { handler } = require('../server.js');

module.exports = (req, res) => handler(req, res);
