# Demo offline và ranh giới tích hợp Tide

Theo Plan C trên https://tide.org/unlocked/#plan-c và FAQ trong https://tide.org/unlocked/config.js (đã đọc ngày 22/10/2026), mô phỏng được chấm như live khi dịch vụ Tide quá tải. Demo này được bổ sung theo yêu cầu đó; các hạn chế live vẫn được ghi rõ.

## Hai tiến trình độc lập

| | `npm run dev:demo` | `npm run dev` / `npm start` |
|---|---|---|
| API | `demo/index.mjs`, loopback 3101 | `server/index.mjs`, mặc định 3001 |
| UI dev | loopback 5174, Vite mode `demo` | 5173, mode thông thường |
| Danh tính | Sáu identity mẫu, header chỉ dùng cho demo | Tide JWT/embedded Ed25519 + DPoP |
| Dữ liệu | `.demo/consentvault-demo.sqlite` | `data/consentvault-policy.sqlite` |
| Key | Local AES storage key trong `.demo/`, server giữ key | Không có local content key; SDK/Fabric |
| Quyết định quyền | Owner consent và hai admin IDs khác nhau trong SQLite | App consent + signed RelationshipAttestation policy, Tide enforcement |
| Có gọi Tide không? | Không | Có khi cấu hình và sử dụng live |

Frontend kiểm tra mode của build và mode API khớp nhau trước khi khởi động. URL query, lỗi license, thiếu adapter hay biến `DEMO_MODE` không mở demo trong live. Demo launcher không load `.env`; server bỏ qua đường DB/bind/config live. `.demo/` được Git ignore và Vite chặn phục vụ qua HTTP. Không dùng demo làm fallback của API live.

## State machine và quyền

1. Chỉ contributor Lan tạo record từ sample cố định. Backend không nhận nội dung tùy ý, role hoặc owner từ request.
2. Chỉ owner request một researcher được chọn cho đúng record. Consent/request bất biến; không có API sửa người nhận hoặc approval count.
3. Request bắt đầu `pending`, 0/2. `demo_approvals` có primary key `(request_id, admin)`; duyệt lặp không thêm phiếu. Chỉ hai identity admin của server được duyệt; body không chọn approver.
4. Một phiếu vẫn `pending`. Phiếu thứ hai từ admin khác mới chuyển `active`. Backend kiểm tra lại owner consent, record, recipient và hai admin hợp lệ khi mở, không chỉ tin chip/status trong React.
5. Owner có quyền mở record của mình. Researcher cần grant active đúng bản ghi và danh tính. Operator/admin không có override đọc hoặc tự tạo request. Catalog chỉ là metadata synthetic để thử một request đọc bị từ chối thật.
6. Thành công, pending, từ chối đọc/share/approval và chọn identity được ghi audit metadata. Không ghi sample plaintext hoặc key. Reset có xác nhận, chỉ xóa bảng demo.

Đây là mô phỏng quyền của Tide. Cùng một người có thể chọn Admin 1 rồi Admin 2: demo không chứng minh hai người thật độc lập, chữ ký enclave hoặc quorum mật mã. Hai approval rows không phải ORK participation threshold. Quy tắc hai admin của demo là mô hình minh họa cho governance, tách khỏi consent của Lan.

## Điểm nối khi Tide hoạt động lại

| Hành vi demo | Nối vào live đã giữ trong code |
|---|---|
| Chọn identity, header `X-Demo-Identity` | `src/main.jsx`: TideCloak provider; `server/auth.mjs`: token EdDSA, issuer/audience/client và `tideuserkey`; `server/dpop.mjs`: sender binding/replay |
| Lan yêu cầu reader | `server/app.mjs`: owner-only policy request; consent vẫn thuộc ứng dụng |
| Hai admin nhấn Approve | `src/tide-policy.mjs`: đọc M0 bằng token admin, enclave operator approval, `PolicySignRequest`, Fabric signature; cấu hình active admin governance thực tại Tide console |
| Grant riêng record/recipient | `shared/relationship.mjs`: `RelationshipAttestation:1`, User subject nguyên `tideuserkey`, assignmentId=record ID, đúng một tag, read-only roles |
| Tạo/mở sample bằng local AES | `src/tide-policy.mjs`: `IAMService.doEncrypt` / `doDecrypt` với signed policy; API live nhận ciphertext |
| Kiểm tra bản ghi và không tự cấp quyền | `server/app.mjs`, `server/policies.mjs`: owner/recipient/binding/signature checks; sau đó cần live ORK refusal tests |

Đã gọi Tide MCP 1.9.33 thật và đọc lại `relationship-attestation`, `invariants` khi thiết kế demo. Không đưa local AES vào adapter Tide; không gọi nó là Never-Whole-Key. Chi tiết kiểm chứng ở `VERIFICATION.md`. Quay video có banner theo `DEMO.md`; không cần hoàn tất license để chạy bản mô phỏng.
