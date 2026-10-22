# Báo cáo kiểm tra ConsentVault

Cập nhật **22/10/2026** theo Plan C chính thức. Kiểm tra trên cloud Linux: Node 24.19.0, npm 11.9.0, Chromium. Hướng dẫn Windows đã soạn; chưa chạy trực tiếp trên Windows.

## Bản demo offline

| Kiểm tra | Kết quả |
|---|---|
| `npm run dev:demo` | Đạt: API 127.0.0.1:3101, Vite 127.0.0.1:5174; kiểm tra socket xác nhận cả hai chỉ bind loopback |
| `npm run check` | **23 test đạt, 0 lỗi/skip** và production live build thành công; gồm 18 test live cũ và 5 test demo |
| `npm run test:demo:browser` | Đạt toàn bộ luồng bằng Chromium, thao tác qua UI; HTTPS bị chặn trong suốt bài thử, không phát sinh external HTTP request |
| `npm run test:browser` | Đạt hồi quy live: landing, protected tabs, không có identity switcher, mobile và sign-in đóng khi thiếu adapter |
| Nhãn mô phỏng | Banner đúng chuỗi trên landing và workspace; sticky khi scroll; sáu identity mẫu, đổi identity xóa nội dung đã mở |
| Lan và owner consent | Tạo hai sample, owner mở được cả hai; chỉ owner tạo reader request; request riêng passage cho An |
| Quorum demo | 0/2 → 1/2 pending → 2/2 active; cùng admin duyệt lại hoặc replay đồng thời không đủ; body không giả approver được |
| An / Bình / Operator | An bị từ chối trước/sau một phiếu, mở passage sau hai phiếu, survey vẫn bị từ chối. Bình bị từ chối cả hai. Operator self-grant và đọc đều bị từ chối |
| Audit | Browser/API thấy các sự kiện allowed, pending và denied; không lưu sample plaintext hoặc key trong audit |
| Persistence / reset | Restart API giữ record và approval; reload browser giữ grant; reset có xác nhận, xóa demo tables; bytes của live DB fixture giữ nguyên |
| Local storage | SQLite `.demo/` chỉ có local AES-GCM envelope; local key ngoài DB. Đây không phải Tide E2EE; server có thể giải mã |
| Local boundary | API chặn foreign Origin, Host và thiếu marker/identity. Vite chặn GET `.demo/local-storage.key` với 403 |
| Tách live | Live config không trả mode demo; live API từ chối demo headers/routes/reset. Không có demo table trong live store |
| Giao diện | Giữ shell teal/light hiện có, desktop/mobile không overflow, không uncaught browser exception |

Browser test tự reset **chỉ database demo** trước khi thử. Screenshots nội bộ trong `test-results/demo-*.png` (Git ignore). Chạy ở terminal khác trong khi `npm run dev:demo` đang chạy:

```powershell
npm.cmd run check
npm.cmd run test:demo:browser
```

Cần Chrome/Chromium; đặt `CHROME_PATH` nếu không ở vị trí mặc định. Demo không nhận nội dung người dùng tùy ý, chỉ hai sample fake có sẵn. Danh tính có thể chuyển công khai, không có xác thực người thật.

## Tide MCP, tài liệu và live

- Đã tải lại `tide.org/unlocked/` và `unlocked/config.js`: có cảnh báo quá tải, Plan C và câu “Simulated and live integrations are judged exactly the same.”
- Đã chạy lại `npm run mcp:check`: MCP thật @tideorg/mcp 1.9.33, initialize, list 22 tools, call canon/list/playbook đạt. Đọc lại `tide_scenario relationship-attestation` và `tide_canon invariants` cho bản demo.
- Hosted MCP đã được xác minh initialize/list/call ở lần triển khai trước; CLI global `codex mcp add` vẫn không lưu được vì Codex home read-only. Không nhầm MCP với kết nối Fabric.
- Live backend/auth/DPoP/policy codec và SDK encrypt/decrypt được giữ. Test live dùng chữ ký fixture thật với test root; opaque ciphertext fixture không chứng minh Fabric encryption.
- DPoP relay byte-exact SDK vẫn qua checksum khi build. Tide doctor lần đo live trước: **9 PASS, 2 FAIL, 1 WARN** vì thiếu embedded JWK/vendorId/origin signature.
- Realm cloud `consentvault-tide` từng tạo được nhưng license/VRK chưa xác nhận: `setUpTideRealm` gặp lỗi 500, InitializeWallet/proxy tunnel 403. Chưa có enrollment/adapter đầy đủ; bản demo không thay đổi trạng thái đó.
- **Chưa kiểm chứng live:** login với adapter đầy đủ, Fabric encrypt/decrypt và refusal sai subject/record/tag, policy signing, M0 active threshold và một admin chưa đủ quorum. Hai phiếu demo không được dùng làm bằng chứng các mục này.
- Bản đồ thay mô phỏng bằng Tide nằm trong [DEMO-MODE.md](docs/DEMO-MODE.md).

## Git và deliverables

- FairEnrol/reference được giữ nguyên, không có diff so với main; kiểm tra lại hash baseline của 12 file source/config/tài nguyên.
- `.demo/`, local key, database, `.env`, `.setup/`, adapter runtime, node_modules, dist và test-results bị Git ignore. Trước commit kiểm tra staged diff và quét secrets.
- README gốc và app có Project overview dưới 300 từ, trả lời đủ năm tiêu chí. `DEMO.md` hướng dẫn quay video mô phỏng hai phút.
- Chưa quay/nộp video MP4; chưa merge PR hoặc nộp bài tự động.
