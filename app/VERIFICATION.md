# Báo cáo kiểm tra ConsentVault

Cập nhật **22/10/2026** sau khi kết nối MCP hosted/local và sửa tích hợp theo canon Tide. Máy cloud: Node 24.19.0, npm 11.9.0, Docker 28.4.0, Chromium. Chưa chạy trên Windows; hướng dẫn PowerShell đã soạn.

## Kết quả hiện tại

| Kiểm tra | Kết quả thực tế |
|---|---|
| Codex CLI | 0.163.0, có MCP; `codex mcp add tide --url https://mcp.tide.org/mcp` không ghi được config vì filesystem read-only |
| Hosted Tide MCP | **Đạt:** initialize xác nhận server 1.9.33, list 22 tools, call `tide_list` trả playbook đúng; lỗi proxy 403 trước đó đã hết |
| `npm run mcp:check` | **Đạt:** local server @tideorg/mcp 1.9.33, initialize, list 22 tools, call canon/list/playbook thành công |
| Tài liệu chính thức | Bốn URL được yêu cầu nay đều tải được HTTP 200; đã xác nhận tiêu chí 25/20/20/20/15 |
| `npm test` | **18 test đạt, 0 lỗi, 0 skip**; dùng issuer và chữ ký fixture có ghi rõ |
| `npm run build` | Đạt; policy serializer SDK được bundle cho Node, frontend 134 module build thành công |
| `npm run dev` | Đạt; API 3001 + Vite 5173 khởi động |
| `npm run test:browser` | Đạt: landing, 3 trang yêu cầu đăng nhập, không role switcher, mobile không overflow, không exception; sign-in bị khóa khi adapter chưa đủ |
| DPoP relay trên wire | **200**, byte-exact SDK; CSP riêng, Allow-CSP-From `*`; SHA-256 `9d7844b938f0a2565fa910d3d30e9b8797cbfd6e0b73d59d804169a089aea757` |
| Tide doctor static + running app | **9 PASS, 2 FAIL, 1 WARN**. Hai lỗi là adapter chưa có embedded `jwk` và `vendorId`; warning thiếu client-origin-auth. Relay, server verification và secret checks đạt |
| `npm run check:tide` | **Chưa hoàn tất, exit 2**: thiếu vendorId, homeOrkUrl, embedded Ed25519 key và chữ ký origin. Không fetch remote JWKS làm fallback |
| Bootstrap realm mới | Tạo `consentvault-tide` thành công, realm cũ được giữ. `setUpTideRealm` vẫn trả **500**; InitializeWallet trong container gặp proxy tunnel **403** sau khi sửa trust store cho CA proxy. Host gọi ORK trả 200; chưa xác nhận license/VRK |
| Reference hash | 12 file source/config/tài nguyên giữ nguyên so với baseline; không tính các cache node_modules/dist đã tồn tại từ onboarding |
| Rà soát trước commit | `git diff --cached --check` đạt; quét 40 file staged không phát hiện token/private key/email license thật hoặc credential hiện hữu. Không stage `.env`, adapter runtime, database, `.setup/`, node_modules hay build outputs; không có thay đổi reference |
| Project overview | 228 từ, dưới 300; năm mục đã đối chiếu config chính thức |

Screenshots nội bộ tại `test-results/landing-desktop.png` và `landing-mobile.png` (Git ignore). Không tạo preview link localhost cho Codex web.

## Suite 18 test chứng minh gì?

- Thiếu embedded JWKS hoặc adapter đầy đủ thì API trả 503; không hạ cấp sang Keycloak/OIDC thông thường.
- JWT EdDSA/issuer/audience/azp/exp/iat/typ/chữ ký; từ chối token giả, ID token và thiếu claim bắt buộc.
- DPoP proof: scheme, key thumbprint, ath, htm, htu, iat và jti. Bearer replay và proof bị sửa bị từ chối.
- JTI đã dùng vẫn bị từ chối sau khi đóng/mở lại API và SQLite.
- Thành viên và Tide user key lấy từ claim đã xác minh; client không tự chọn key hay đổi key đã đăng ký.
- Lan reserve hai record metadata; chưa có signed owner policy thì chưa upload ciphertext được; trường plaintext bị từ chối.
- Policy bytes serialize bằng SDK thật, chữ ký Ed25519 thật với **test root key**. API từ chối sai subject/record/role/expiry, chữ ký giả và admin policy threshold 1.
- Chỉ owner request sharing; operator không thể tự thêm grant. Admin không được upload policy cấp quyền cho chính mình.
- Sau signed read policy đúng An/record 1, An chỉ lấy được record 1 và policy của mình; GET record 2 trả 404. Bình/operator không có policy phù hợp đều không đọc được qua API.
- Policy, ACL và ciphertext fixture tồn tại sau restart; DB/WAL/audit không có sentinel plaintext, token hoặc private test key.

**Không suy rộng:** ciphertext trong suite là opaque fixture, không phải kết quả Tide. Suite không kiểm tra Fabric decrypt và không dùng private test key làm runtime fallback. Những kết quả AES/RSA roundtrip của prototype trước không được tính là kiểm chứng E2EE hiện tại; luồng RSA đó đã bỏ.

## Phần bị chặn và bước tiếp theo

1. **Network container:** hosted MCP đã hoạt động, host gọi ORK được nhưng InitializeWallet trong container còn proxy tunnel 403. Đã bổ sung CA công khai của proxy vào trust store, không tắt TLS. Cần chẩn đoán đúng kết nối outbound của container trước khi resume; không retry license liên tục. Draft save không chứng minh runtime đã kết nối.
2. **Realm setup:** stage hiện là `created`, chưa xác nhận license/VRK. Email và sự đồng ý Terms đã được chính chủ dự án cung cấp. Không cần hỏi lại hai thông tin đó cho realm này. Master-admin credential hiện hữu chỉ dùng trong bootstrap, không vào app API/log/repository.
3. **Human Tide account:** sau activation cần chính người dùng liên kết account trong enclave. Chưa có invite vì chưa qua bước ORK. Không hỏi mật khẩu/recovery qua chat, không tạo account giả. Browser người dùng phải truy cập được instance; localhost cloud khác localhost Windows.
4. **Adapter và QEA:** export chính thức có Ed25519 JWK/vendor/origin signature; hoàn tất IGA. Thêm admin độc lập, regenerate/commit M0 active threshold >=2; không chỉ đếm admin hay dựa vào firstAdmin threshold 1.
5. **Live policy/E2EE:** Lan tạo hai record bằng SDK; admin ký owner policy và read-only policy cho An; An chỉ decrypt record 1. Bình/operator, sai tag, thêm tag, thiếu role và copy policy người khác đều phải bị ORK từ chối. Chưa chạy các bước này.
6. **Live quorum:** một admin chưa đủ phải không tạo được quyền nhạy cảm; sau đủ approvals mới được thực thi. Policy upload guard hoặc chữ ký fixture không thay được kiểm tra này. UI vẫn not verified.

## Thay đổi được giữ để task sau tiếp tục

- Code hiện dùng built-in RelationshipAttestation:1, embedded JWKS và DPoP, không dùng local RSA vault.
- Database prototype cũ còn nguyên; luồng mới dùng `data/consentvault-policy.sqlite`. Không tự giải mã/migrate.
- Source bootstrap là additive, không stop/wipe container; state trong `.setup/`, không in token/invite.
- Hướng dẫn MCP và kiểm tra kết nối có ở `docs/TIDE-MCP.md`, `tools/tide-mcp/`.
- README Windows, DEMO hai phút và SECURITY đã cập nhật. Chưa merge/push/nộp bài hoặc publish snapshot mới.
