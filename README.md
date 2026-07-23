# Web Dev Project Kit — cách dùng

Bộ file này chắt lọc từ memory project "Trợ lý công ty Bretinov" (core_rules, playbook_product_web, playbook_webapp, feedback_model_routing_usage) + bổ sung rules mới cho lập trình web. Dùng cho project mới về lập trình web.

## Cách load vào project mới
1. Upload cả 3 file sau vào Project Knowledge:
   - `00_core_rules.md` — rule luôn áp dụng
   - `01_playbook_web_dev.md` — quy trình thiết kế & code web
   - `02_toi_uu_token.md` — rule tiết kiệm token/usage
2. Dán đoạn sau vào **Project Instructions**:

```
Đầu mỗi task: đọc 00_core_rules.md. Task thiết kế/sửa web → đọc thêm 01_playbook_web_dev.md. Task dài/nhiều file/PPT-report → đọc thêm 02_toi_uu_token.md và hỏi Hoàng cách chạy tiết kiệm usage trước khi bắt đầu.
Cuối mỗi task: cập nhật memory.md trong thư mục project — phần "TRẠNG THÁI HIỆN TẠI" ghi đè cho đúng hiện trạng; session log chi tiết append xuống dưới (ngày + việc đã làm + file tạo ra + việc dang dở).
```

3. Tạo file `memory.md` trống trong thư mục project với 2 phần: `## TRẠNG THÁI HIỆN TẠI` và `## Session log`.
