# Quay ConsentVault trong hai phút — Plan C

Ban tổ chức cho phép mô phỏng và chấm như live: https://tide.org/unlocked/#plan-c. Video này dùng **demo offline**, luôn giữ banner **“Demo mode — Tide protections simulated”** trong khung hình. Không gọi các phê duyệt hoặc local storage encryption là Tide network thật.

## Chuẩn bị trên Windows

```powershell
cd app
npm.cmd ci
npm.cmd run dev:demo
```

Mở **http://127.0.0.1:5174**. Không cần Docker, `.env`, license, tài khoản Tide hoặc mạng Tide. Để bắt đầu sạch: Governance → Reset demo → Confirm reset synthetic demo. Chọn Lan trong Demo identity. Phóng browser khoảng 90–100% để thấy banner và nút thao tác. Có thể quay bằng OBS hoặc công cụ ghi màn hình Windows.

## Kịch bản

| Thời gian | Thao tác thật trong UI | Lời dẫn gợi ý |
|---|---|---|
| 0:00–0:15 | Overview, chỉ vào banner | “ConsentVault giúp người đóng góp quyết định ai đọc từng bản ghi nghiên cứu tiếng Việt. Theo Plan C, các bảo vệ Tide trong video này được mô phỏng.” |
| 0:15–0:30 | Lan → My contributions → Create two sample records; mở hai record | “Lan có một đoạn văn và một khảo sát giả. Ban đầu chỉ chủ sở hữu mở được.” |
| 0:30–0:45 | Trên Vietnamese text: Request sharing → An → tick consent → Record my consent | “Lan chỉ đồng ý chia sẻ đoạn văn cho An. Consent không tự kích hoạt quyền đọc.” |
| 0:45–1:05 | Admin 1 → Governance → Approve as Admin 1; hiển thị pending 1/2. Nếu kịp, thử duplicate hoặc chuyển An thử mở | “Một admin chưa đủ. Duyệt lại bằng cùng danh tính cũng không tạo thêm phê duyệt.” |
| 1:05–1:20 | Admin 2 → Governance → Approve as Admin 2; thấy active 2/2 | “Admin thứ hai mới kích hoạt grant cho đúng An và đúng record.” |
| 1:20–1:40 | An → Shared with me → Open contribution. Trong Synthetic access checks, mở Private survey | “An đọc được đoạn văn. Mở khảo sát bị backend từ chối; quyền không lan sang bản ghi khác.” |
| 1:40–1:55 | Bình thử mở record; Operator → Governance → Try self-grant | “Bình không có grant. Operator cũng không thể tự cấp quyền đọc.” |
| 1:55–2:00 | Demo activity log; giữ banner | “Log ghi cả thành công và từ chối. Khi Tide hoạt động lại, SDK và policy signing live sẽ thay các điểm mô phỏng.” |

Thử đầy đủ trước khi quay: An bị từ chối trước và sau một phiếu; Bình bị từ chối cả hai record; Operator bị từ chối đọc và self-grant. Log phải phản ánh request thực. Có thể cắt đoạn chờ khi dựng video, nhưng không dựng chip Pending/Active hoặc kết quả quyền giả trong editor.

Hai admin ở đây là **hai danh tính mẫu**, không chứng minh hai con người độc lập hay active Tide quorum. Backend demo giữ local storage key; không có Tide E2EE. Tích hợp live được giữ ở `src/tide-policy.mjs`, `server/auth.mjs`, `server/dpop.mjs` và `server/policies.mjs`; xem [điểm nối](docs/DEMO-MODE.md).

## File nộp

Xuất **MP4 khoảng hai phút, dưới 100 MB** và thêm vào repository, ví dụ `app/demo-video.mp4`. `DEMO.md` là kịch bản, không thay cho video. Không quay mật khẩu, token hoặc recovery. Dùng README gốc có overview dưới 300 từ và link video sau khi đã upload. Không dùng video FairEnrol trong reference làm video ConsentVault.
