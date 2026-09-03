# Mathart Web Generator 🎵

![GitHub release (latest by date)](https://img.shields.io/github/v/release/HuynhChien2511/MathartWebGenerator)
![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-blue)

Công cụ nền web giúp chuyển đổi các bài hát `.mp3` thành định dạng đĩa nhạc `.mcdisc` tương thích hoàn toàn với bản mod **MusicDiscForge** và **Mathart** trong Minecraft.

## 🚀 Truy cập trực tiếp
Bạn không cần cài đặt gì cả! Có thể sử dụng ngay tại trang web đã được host sẵn:
**👉 [https://huynhchien2511.github.io/MathartWebGenerator/](https://huynhchien2511.github.io/MathartWebGenerator/)**

## ✨ Tính năng Nổi bật
* ⚡ **Xử lý 100% tại Client:** Mọi thuật toán chuyển đổi âm thanh đều chạy trực tiếp trên trình duyệt của bạn nhờ sức mạnh của **WebAssembly (WASM)**. Không cần tải file lên bất kỳ máy chủ nào!
* 🎧 **Tự động Downmix:** Tự động chuyển đổi âm thanh Stereo sang Mono (`-ac 1`) để tương thích hoàn hảo với hệ thống âm thanh không gian 3D (Spatial Audio) của khối Jukebox trong Minecraft.
* 📊 **Phân tích Phổ Âm (FFT):** Trích xuất dữ liệu tần số âm thanh (Fast Fourier Transform) thành mảng `.json` theo thời gian thực để cấp dữ liệu cho hệ thống hạt 3D (Particle System) của mod Mathart.
* 📦 **Đóng gói Thông minh:** Trả về một file `.mcdisc` duy nhất chứa siêu dữ liệu (metadata), âm thanh (.ogg) và phổ âm (.json) - sẵn sàng ném vào game.

## 💡 Hướng dẫn sử dụng
1. Truy cập trang web: [Mathart Web Generator](https://huynhchien2511.github.io/MathartWebGenerator/)
2. Kéo thả file `.mp3` yêu thích của bạn vào.
3. Điền tên **Bài hát (Title)** và **Ca sĩ (Artist)**.
4. Bấm **Generate (Tạo đĩa nhạc)**.
5. Đợi quá trình chuyển đổi hoàn tất và tải file `.mcdisc` về máy.
6. Copy file `.mcdisc` vào thư mục `[Thư mục Game]/config/musicengraver/discs/` (hoặc `mathart/discs/`).
7. Khởi động Minecraft và thưởng thức!

## 💻 Dành cho Lập trình viên
Dự án sử dụng:
- `@ffmpeg/ffmpeg` và `@ffmpeg/core`: Trình xử lý âm thanh WebAssembly.
- `jszip`: Đóng gói file zip ngay trên trình duyệt.

### Chạy thử môi trường Local (Tùy chọn)
Nếu bạn muốn tự chỉnh sửa mã nguồn và chạy thử, do lý do bảo mật SharedArrayBuffer của WebAssembly, bạn sẽ cần một Local Web Server hỗ trợ COOP và COEP. Bạn có thể chạy file Python tích hợp sẵn:
```bash
python server.py
# Mở trình duyệt tại địa chỉ http://localhost:8000
```
