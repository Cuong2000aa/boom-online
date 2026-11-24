# 💣 Boom Online Web Edition — PortGame.cloud

Phiên bản phục dựng web hoàn chỉnh của tựa game tuổi thơ **Boom Online (Crazy Arcade / BnB)**:
- Đồ họa & Âm thanh nguyên bản của VNG / Nexon.
- Bản đồ huyền thoại: **Cướp Biển 14 (Pirate 14)**.
- Đầy đủ nhân vật (Khò Khò, Hải Tặc...), cơ chế nhặt vật phẩm, thú cưỡi (Rùa, Cú, Đĩa bay UFO), đẩy thùng gỗ X, kim tự cứu.
- Hỗ trợ cả **Chơi Đơn vs Máy (Bot AI)** và **Đấu Trường Nhiều Người (WebSocket)**.
- Tích hợp cụm **Gamepad cảm ứng ảo (Virtual D-pad + Nút đặt bóng)** dành cho Điện thoại & Máy tính bảng.

---

## 🎮 Cách chạy Game

### Yêu cầu:
- Node.js (phiên bản 18+ trở lên).

### Khởi động server:
```bash
# Cài đặt thư viện (chỉ 1 thư viện ws duy nhất)
npm install

# Khởi động game (mặc định cổng 3001)
npm start
```
Mở trình duyệt truy cập: `http://localhost:3001`

---

## ⌨️ Phím điều khiển

| Thao tác | Phím PC | Điện thoại / Tablet |
| :--- | :--- | :--- |
| **Di chuyển** | Phím Mũi tên hoặc `W`, `A`, `S`, `D` | D-pad ảo 4 hướng |
| **Đặt bóng nước** | `Space` (Phím cách) | Nút 💣 BÓNG |
| **Dùng Kim / Vật phẩm** | `Ctrl` hoặc `Shift` | Nút 🪡 KIM |
| **Kích nổ từ xa** | `Space` (khi có bóng điều khiển) | Nút 💣 BÓNG |
| **Đẩy thùng gỗ** | Giữ phím di chuyển vào hòm gỗ X | Giữ nút hướng vào hòm |

---

## 🛠️ Chạy Kiểm Thử (Tests)
```bash
npm test
```
Toàn bộ 30 bài test kiểm tra cơ chế nổ, va chạm, bot AI, đồng bộ WebSocket đều vượt qua 100%.
