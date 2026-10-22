# ConsentVault: mô hình bảo mật hiện tại

## Thay đổi sau khi đọc Tide MCP

Bản đầu dùng AES/RSA trong browser và Tide self-encryption để bọc private bundle. Bản đó **đã được thay thế**, không phải luồng bảo mật đang chạy. Source hiện tại không sinh/reconstruct/export private key dữ liệu và không có offline decrypt fallback. Database cũ được giữ, không tự giải mã/migrate.

Nguồn chính: `@tideorg/mcp@1.9.33`, canon invariants, playbook setup-forseti-e2ee, scenario relationship-attestation; xem [SOURCES.md](SOURCES.md).

## Các lớp bảo vệ

1. **Bootstrap:** license + VRK → Tide attestor/IGA → admin liên kết tài khoản → ký cấu hình/export adapter. Realm OIDC thông thường không đủ. Hiện dừng ở `setUpTideRealm`: InitializeWallet trong container gặp proxy tunnel 403; truy cập HTTP ORK từ host không thay được kiểm tra này.
2. **Identity:** access token ký EdDSA, chỉ xác minh bằng embedded Ed25519 public JWKS trong adapter. Không fetch remote certs. Kiểm tra issuer, audience của API, azp/client, sub, exp, iat và roles. Thiếu adapter đầy đủ trả 503, không hạ cấp OIDC.
3. **DPoP:** realm bật sender-bound tokens; client dùng strict ES256 và `IAMService.secureFetch` với URL tuyệt đối. API bắt buộc scheme DPoP, xác minh proof bằng public JWK của proof, typ/alg, cnf.jkt, ath, HTTP method, URL không query, iat và jti. Origin dùng cấu hình cố định, không tin x-forwarded headers do client gửi. JTI lưu SQLite, giữ chống replay qua restart và giữa các process cùng DB. Triển khai nhiều máy cần DB chia sẻ phù hợp.
4. **Owner consent:** chỉ chủ record có role contributor được reserve record hay request reader. Body không nhận owner/key do client tự khai. Tide user key lấy nguyên dạng từ claim đã xác minh; thay identity key đã đăng ký bị từ chối.
5. **Policy:** built-in `RelationshipAttestation:1`, subjectType `User`, subjectId đúng tideuserkey người nhận; assignmentId đúng record ID; roles là JSON string `_tide_encryptor`/`_tide_decryptor`. Policy owner read-write; An chỉ read. Một tag duy nhất là record ID. Không tự viết/deploy custom contract.
6. **Policy signing:** admin độc lập dùng browser/enclave của chính mình. Helper dùng `PolicySignRequest.New`, approve rồi attach M0 admin policy, execute signing; không có backend/master-admin endpoint ký thay. API yêu cầu realm-management client role tide-realm-admin, từ chối admin tự cấp cho mình, kiểm tra policy bytes/chữ ký Ed25519, subject, assignment, quyền và expiry trước khi lưu.
7. **Content:** browser gọi `IAMService.doEncrypt(data, signedPolicyBytes)` và `doDecrypt` có policy. Server chỉ nhận ciphertext, không có content key hay plaintext. Policy không thay thế token/DPoP/ACL của API.

## Chữ ký và quorum không được đánh đồng

Server còn yêu cầu một admin policy được ký, contract `GenericResourceAccessThresholdRole:1`, role tide-realm-admin, resource realm-management, model Policy:1 và threshold >=2. Điều này kiểm tra **nội dung policy được ký**, không tự chứng minh policy đang active hoặc request thực tế đã đi qua bao nhiêu admin. Một chữ ký relationship riêng lẻ không chứa lịch sử toàn bộ ceremony.

Cần kiểm tra M0 policy **đang hiệu lực**, các admin độc lập đã liên kết và thử một admin bị từ chối thật trên network. Không đánh dấu quorum verified bằng config checkbox, việc upload policy hay đếm thành viên. Với fallback floor(0.7 × admins), hai admin có thể vẫn cho threshold 1; phải đọc policy active, thường cần ít nhất ba admin để có threshold 2.

Lan bấm request là consent ở backend, không phải Tide chứng thực consent riêng của Lan. Với built-in contract này, grant được cấp bởi admin signing dưới quorum. Một quorum admin hợp lệ vẫn là authority quản lý policy; không tuyên bố network buộc phải có chữ ký cá nhân của Lan. Luồng owner-issued network attestations là bài toán khác, chưa triển khai.

## Lưu trữ

`data/consentvault-policy.sqlite` lưu:

- subject, Tide public user key, tên hiển thị từ claim và metadata role researcher;
- record ID, owner, loại dữ liệu, thời gian và ciphertext;
- yêu cầu consent, signed policy bytes, người upload, expiry;
- audit metadata và replay JTI.

Không lưu plaintext đóng góp, private bundle hoặc raw decryption key. Không log request body, token, raw JWT/crypto error hay lời mời enrollment. Lời mời bootstrap là credential một lần, nằm trong `.setup/` Git ignore với mode 0600; không in ra chat/log.

Metadata chưa được mã hóa hết. Audit không phải immutable ledger. API chỉ chứng nhận policy binding/signature, không giải mã để kiểm tra người dùng có thật sự upload một ciphertext hợp lệ hay không. Tide phải xác minh ciphertext/policy khi dùng.

## Hạn chế cần giữ rõ

- **Live chưa kiểm chứng:** chưa có VRK/license/export đầy đủ, chưa có đăng nhập Tide IdP trên realm mới, policy signing/E2EE chưa chạy trên ORK. Tests dùng issuer/signature fixture, không phải bằng chứng Fabric enforcement.
- **Revocation:** chưa triển khai thu hồi tức thì; policy có hạn một giờ. Xóa row không vô hiệu bản policy người nhận đã giữ. Không thể xóa plaintext người nhận đã lưu. Chưa có quản lý renew reader đầy đủ.
- **Thiết bị/code phân phối:** browser hoặc JavaScript bị chiếm quyền có thể lấy plaintext sau khi người dùng decrypt. Chưa có audit bảo mật độc lập/supply-chain hardening hoàn chỉnh.
- **CSP:** production cho phép iframe theo canon Tide; DPoP relay dùng asset byte-exact và CSP riêng của SDK. Không thêm frame-ancestors/X-Frame-Options gây chặn enclave. Kiểm tra trên wire đã qua; chưa có real login để chứng minh toàn bộ ceremony.
- **Root/realm admin:** app operator không có override dữ liệu, nhưng không tuyên bố chống được identity infrastructure có quyền tuyệt đối khi chưa có active quorum thực. Master admin chỉ dùng trong bootstrap script, không trong API app.
- **Tài khoản:** không tạo nhiều identity admin do một agent giữ credential để giả vờ có độc lập. Người dùng tự liên kết và giữ mật khẩu/recovery trong enclave.
- **Migration:** dữ liệu của prototype RSA cũ không được tự chuyển; nếu có dữ liệu, cần owner đọc và re-encrypt qua Tide sau khi setup thật, trong một tác vụ riêng có kiểm tra.

Không dùng dữ liệu nghiên cứu thật trong trạng thái hiện tại.
