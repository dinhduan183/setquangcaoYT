# setquangcaoYT

Extension Chrome chèn **vị trí quảng cáo giữa video** trong YouTube Studio theo timestamp của tracklist (video tổng hợp nhạc).

## Cài đặt

### Cách 1 — Tải ZIP

1. Trên trang GitHub này bấm **Code → Download ZIP**, rồi giải nén ra một thư mục.
2. Mở Chrome, vào `chrome://extensions`.
3. Bật **Developer mode** (góc trên bên phải).
4. Bấm **Load unpacked** và chọn thư mục vừa giải nén (thư mục chứa `manifest.json`).
5. Bấm biểu tượng mảnh ghép trên thanh công cụ, ghim extension để dễ mở.
6. Tải lại (F5) các tab YouTube Studio đang mở.

### Cách 2 — Git clone

```bash
git clone https://github.com/dinhduan183/setquangcaoYT.git
```

Sau đó làm từ bước 2 ở trên, chọn thư mục `setquangcaoYT`.

### Cập nhật bản mới

1. Tải ZIP mới (giải nén đè vào thư mục cũ) hoặc chạy `git pull` trong thư mục đã clone.
2. Vào `chrome://extensions`, bấm nút tải lại (↻) của extension.
3. Tải lại (F5) trang YouTube Studio.

## Sử dụng

1. Trong YouTube Studio, mở video → **Kiếm tiền** (đã tick *Hiện quảng cáo trong video của tôi*).
2. Bấm icon extension, dán tracklist vào ô **Tracklist**.
3. Chọn cách chọn mốc và kiểm tra danh sách ở phần **Xem trước**.
4. Bấm **Chèn vào YouTube Studio**. Extension tự mở hộp thoại *Vùng quảng cáo trong video*, bỏ tick *Vị trí quảng cáo tự động* và chèn từng mốc. Tiến trình hiện ngay trong phần Xem trước.
5. Kiểm tra lại trong Studio rồi bấm **Tiếp tục → Lưu**. Extension không tự lưu.

Nút **Xoá hết** tắt vị trí tự động và xoá mọi vị trí quảng cáo trong hộp thoại (bấm 2 lần để xác nhận). YouTube cần ít nhất 1 vị trí quảng cáo mới cho bấm *Tiếp tục*, nên dùng nút này để dọn trước khi chèn bộ mốc mới.

## Cách chọn mốc

| Chế độ | Vị trí quảng cáo |
|---|---|
| **Tất cả mốc** | Đầu mọi bài, trừ bài đầu tiên. |
| **Bội số 7:00** | Mốc 3:30, rồi 7:00, 14:00, 21:00… Mỗi mốc lấy điểm hết bài gần nhất. Từ quảng cáo thứ 3, hai quảng cáo liền nhau cách nhau tối thiểu một nửa khoảng (3:30). Khoảng 7:00 sửa được. |
| **Mỗi 2 bài** | Hết bài 1, 2, 4, 6, 8, 10… |

## Định dạng tracklist

Mỗi dòng một bài, có một mốc thời gian ở bất kỳ vị trí nào trong dòng:

```
00:00:00 Bài 1
3:01 Bài 2
[00:05:50] Bài 3
Bài 4 - 09:33
```

- Hỗ trợ `giờ:phút:giây` và `phút:giây`. Dòng không có mốc thời gian sẽ bị bỏ qua.
- Nên có dòng bài đầu tiên ở `00:00`, vì dòng đầu danh sách được coi là bài 1.
- Nếu một dòng có nhiều mốc thời gian, chỉ mốc đầu tiên được dùng.
