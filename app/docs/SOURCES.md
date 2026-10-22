# Nguồn Tide đã đọc và mức độ xác minh

## Cập nhật Plan C — 22/10/2026

Đã tải lại https://tide.org/unlocked/ và https://tide.org/unlocked/config.js. Trang có cảnh báo network quá tải và mục https://tide.org/unlocked/#plan-c; FAQ xác nhận: “Simulated and live integrations are judged exactly the same.” Vì vậy thêm demo offline được ghi nhãn riêng; các ghi chú live phía dưới vẫn giữ mức kiểm chứng cũ.

Đã gọi lại MCP `tide_scenario relationship-attestation` và `tide_canon invariants`: tiếp tục dùng mô hình đúng user/record, role, consent và governance riêng. Quy tắc local hai admin chỉ mô phỏng ceremony; local AES không phải Never-Whole-Key, và không đưa key demo vào luồng live. Bản đồ điểm nối nằm trong [DEMO-MODE.md](DEMO-MODE.md).

Cập nhật **22/10/2026**. Trang chính thức hiện truy cập được; đã gọi cả hosted MCP và MCP local thật, không chỉ đọc README của package.

## Nguồn web đã tải thành công HTTP 200

- https://tide.org/unlocked/
- https://tide.org/unlocked/config.js — xác nhận năm tiêu chí và trọng số **25/20/20/20/15**, các prompt README và video hai phút.
- https://docs.tide.org/
- https://tide.org/agent-plugins và https://tide.org/tide-agent-pack.md — chỉ định hosted MCP và fallback local `@tideorg/mcp`.
- https://docs.tide.org/Admin/e2ee — E2EE cần licensed Tide IdP + QEA/doken, roles đúng và thay đổi được authorize.
- https://docs.tide.org/Admin/SetupIGA — human account linking, thêm admin, QEA approvals.
- https://docs.tide.org/Admin/license — initial free tier, không tự theo paid checkout.
- https://docs.tide.org/Core-Concepts/forseti-engine
- https://docs.tide.org/API/Admin%20API%20Reference

## MCP thật đã gọi

Package chính thức **@tideorg/mcp 1.9.33**, MCP SDK client **1.32.1**. Initialize → list 22 tools → call thành công. Đã lấy nội dung từ:

- `tide_adapter AGENTS`;
- `tide_canon invariants`, framework-matrix (React và Express), tidecloak-bootstrap, iga-change-requests-api;
- `tide_playbook setup-forseti-e2ee`, bootstrap-realm-from-template, verify-jwt-server-side;
- `tide_scenario relationship-attestation` cùng manifest, roles và bootstrap;
- `tide_gaps`, `tide_hosting`, `tide_dpop_asset`, `tide_doctor`.

Bản canon yêu cầu embedded JWKS và DPoP chặt hơn default của SDK. Đã áp dụng ở app, không sửa node_modules để bỏ check.

## Các quyết định dựa trên nguồn

- `RelationshipAttestation:1` dựng sẵn trên ORK main, User subject lấy nguyên `tideuserkey`, assignmentId là record ID, chỉ một tag. Admin grant, không phải owner-issued grant tự động. Nguồn pack đánh dấu các edge case đã đo ở stack của họ; điều đó **không** chứng minh network/app này đã qua test.
- Policy phải tạo bằng SDK `Models.Policy.latestVersion`, serialize bằng SDK, không tự ghép bytes; admin ký qua enclave bằng API được template chỉ dẫn.
- Tạo custom contract/deploy lên network không self-service; không cần làm cho thiết kế đã chọn.
- Embedded JWKS chỉ public Ed25519; DPoP proof dùng key ephemeral ES256 riêng, là sender binding, không phải content key.
- IGA endpoint khác theo phiên bản. Canon hiện ưu tiên `/approve` hai lượt khi cần enclave; script firstAdmin có tương thích `/authorize` và `/approve` trên fresh realm, không proxy approval qua service account trong multiAdmin.
- Quorum active nằm trong signed M0 policy, không suy từ UI/số người; fallback `floor(0.7 × admins)` có thể là 1 với hai admin.
- DPoP relay copy từ SDK, SHA-256 xác nhận `9d7844b938f0a2565fa910d3d30e9b8797cbfd6e0b73d59d804169a089aea757`; không đổi checksum để bỏ qua lỗi.

Runtime pin: `@tidecloak/react 0.14.33`, `@tidecloak/js 0.14.41`, `heimdall-tide 0.14.41`, `@tideorg/js 0.14.29`, theo phiên bản npm hiện có. Policy serializer được bundle cho Node bằng esbuild vì package browser có import ESM không đuôi.

Nguồn GitHub SDK đã đọc trước đây vẫn hữu ích, nhưng các ghi chú prototype về remote JWKS/RSA vault không còn mô tả kiến trúc hiện tại.

## Kết nối và phần chưa đạt

- Hosted https://mcp.tide.org/mcp: lỗi proxy 403 đầu phiên đã hết; initialize xác nhận server 1.9.33, list 22 tools, call `tide_list` thành công. Cấu hình Codex CLI global vẫn không ghi được vì filesystem read-only. Local stdio MCP cũng hoạt động; cả hai không tự trở thành native tool của Codex web.
- `setUpTideRealm` trên realm mới vẫn trả 500. Sau khi thêm CA proxy của môi trường vào container, lỗi TLS đã hết nhưng InitializeWallet gặp proxy tunnel 403. HTTP ORK từ host trả 200 không chứng minh container gọi được. Không suy ra license đã được cấp hoặc network crypto đã chạy.
- Realm mới vẫn ở stage `created`, chưa có người dùng/license/VRK. IdP dang dở đã được sao lưu riêng trước các lần sửa chữa có kiểm tra trạng thái; không wipe Docker, không sửa realm FairEnrol. Chưa có invite để chủ dự án liên kết tài khoản.
