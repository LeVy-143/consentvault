[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak)

# ConsentVault

## Project overview

### 1. Vision & originality — 25%
ConsentVault is a contributor-controlled vault for synthetic Vietnamese language research. Permission applies to one contribution and one named researcher, rather than a blanket dataset export.

### 2. Trust constraint insight — 20%
Lan contributes a language passage and a private survey. She shares only the passage with An. Bình receives neither; operating the service grants no automatic reader access. This makes participation possible without surrendering every contribution.

### 3. Value & impact — 20%
Contributors can understand who may read each record. Researchers receive specifically consented material: An can study Lan’s passage while her survey stays private.

### 4. Why TideCloak matters — 20%
The retained live integration uses Tide identity, embedded Ed25519 verification, DPoP and record-specific RelationshipAttestation policies through the SDK. Owner consent is application logic; policy signing and identity governance belong to Tide. Under the organisers’ Plan C, an explicitly labelled offline demo simulates these protections. Its local backend checks ownership, recipient and two distinct demo-admin approvals. These are simulated approvals, not Tide signatures or proof of live quorum.

### 5. Prototype & storytelling — 15%
Switch six synthetic identities, create two records, request access for An, observe one approval remain pending and two activate access, then test denied reads and operator self-grants. A persistent audit shows allowed and denied actions. Live licensing, Fabric encryption and multi-admin governance remain unverified.

## Chạy demo offline để quay video — Windows

Ban tổ chức đã bổ sung **Plan C**: “Simulated and live integrations are judged exactly the same.” Đã đối chiếu FAQ tại https://tide.org/unlocked/config.js và https://tide.org/unlocked/#plan-c ngày 22/10/2026.

Cài Node.js **24 LTS**, mở PowerShell tại repository:

```powershell
cd app
npm.cmd ci
npm.cmd run dev:demo
```

Mở **http://127.0.0.1:5174**. Không cần Docker, license, `.env`, adapter, tài khoản Tide, MCP đang chạy hoặc kết nối Tide network. Lần đầu `npm ci` cần Internet để tải dependencies; sau khi cài, demo hoạt động offline. `Ctrl+C` dừng demo.

Banner luôn hiện **“Demo mode — Tide protections simulated”**. Chọn **Demo identity** để đổi Lan, An, Bình, Operator, Admin 1, Admin 2. Đây là impersonation công khai của danh tính giả, không phải đăng nhập thật hay admin độc lập được xác thực.

1. Lan → **My contributions → Create two sample records**. Hai record chỉ chứa sample giả có sẵn; backend không nhận nội dung tùy ý.
2. Trên **Vietnamese text**, chọn **Request sharing → An**, tick consent rồi **Record my consent**. Private survey không được chọn.
3. Admin 1 → **Governance → Approve as Admin 1**: vẫn **pending · 1/2**. Duyệt lại bị từ chối; An vẫn chưa mở được.
4. Admin 2 → **Governance → Approve as Admin 2**: chuyển **active · 2/2**.
5. An → **Shared with me → Open contribution** đọc passage. Trong **Synthetic access checks**, thử mở survey sẽ bị backend từ chối.
6. Bình thử mở cả hai: bị từ chối. Operator → Governance → **Try self-grant** và **Try opening record**: đều bị từ chối. **Demo activity log** ghi đủ kết quả.

Để quay lại: **Governance → Reset demo → Confirm reset synthetic demo**. Reset chỉ xóa bảng demo. Dữ liệu và phê duyệt vẫn còn sau reload/restart nếu chưa reset.

Demo API bind `127.0.0.1:3101`, Vite bind `127.0.0.1:5174`; cả hai dùng port riêng. Demo backend bỏ qua `HOST`, `PORT`, `DATABASE_PATH`, `TIDECLOAK_CONFIG` của live và không đọc `.env`. Vite không phục vụ `.demo/`, `data/`, `.setup/` hoặc `.env` qua HTTP. Không expose demo qua tunnel hay dùng dữ liệu thật.

Demo lưu riêng trong **`app/.demo/`** (Git ignore): SQLite và local storage key. AES-GCM tại localhost chỉ giữ sample không ở dạng plaintext trong DB; **server demo có toàn bộ key và nhìn thấy plaintext khi mở**, nên không phải Tide E2EE, Never-Whole-Key hay bảo vệ chống admin máy chủ. Identity header và hai approval rows là mô phỏng; không tạo JWT/policy signature Tide giả.

Kiểm tra tự động (giữ `npm run dev:demo` chạy ở terminal thứ nhất):

```powershell
npm.cmd run check
# Cần Chrome/Chromium; script reset toàn bộ dữ liệu demo trước khi thử luồng.
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm.cmd run test:demo:browser
```

Xem [DEMO.md](DEMO.md) để quay video hai phút và [điểm nối Tide](docs/DEMO-MODE.md). Lệnh **`npm run dev` và `npm start` vẫn là live**, không tự chuyển sang demo khi Tide lỗi. Live không nhận danh tính demo hoặc endpoint reset demo.

## Tích hợp live được giữ nguyên

Ứng dụng mới ở `app/` tại gốc Git repository. FairEnrol tại `../RMIT-ConsentVault/reference/` được giữ nguyên và không được phát triển tiếp.

**Nhánh live dùng policy Tide, không dùng RSA envelope prototype trước đây.** Không còn tạo/export private key dữ liệu trong trình duyệt, không còn vault khóa tự tạo hoặc giải mã offline. Database cũ `data/consentvault.sqlite` được giữ nguyên; luồng mới dùng `data/consentvault-policy.sqlite`, không tự di chuyển dữ liệu mã hóa cũ.

Hiện **chưa hoàn tất tích hợp live**: realm mới `consentvault-tide` đã tạo; `setUpTideRealm` trả HTTP 500 do InitializeWallet trong container gặp proxy tunnel 403. HTTP tới ORK từ máy cloud trả 200 nhưng chưa chứng minh container gọi được. Chưa xác nhận license/VRK, chưa liên kết tài khoản Tide, chưa có adapter đầy đủ hay multi-admin quorum. Code không thay những bước này bằng đăng nhập/chữ ký giả. Xem [báo cáo](VERIFICATION.md).

## Tide MCP: đã kiểm tra gì?

Codex CLI 0.163.0 có MCP, nhưng lệnh `codex mcp add tide --url https://mcp.tide.org/mcp` không ghi được cấu hình global do filesystem chỉ đọc. Hosted MCP đã được xác minh initialize → list **22 tools** → tools/call thành công. Cấu hình CLI không tự thêm công cụ vào phiên Codex web.

Fallback chính thức **MCP local stdio** đã chạy bằng `@tideorg/mcp@1.9.33`: initialize, list **22 tools**, gọi `tide_canon`, `tide_list` và `tide_playbook` thành công. Kiểm tra lại trên Windows:

```powershell
npm.cmd run mcp:install
npm.cmd run mcp:check
npm.cmd run mcp:check:hosted
```

Gói MCP chỉ nằm trong `tools/tide-mcp/`, tách khỏi runtime app. Chi tiết tại [TIDE-MCP.md](docs/TIDE-MCP.md).

## Cài và chạy trên Windows

Cài Node.js **24 LTS**, mở PowerShell tại repository:

```powershell
cd app
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Trên máy Windows của bạn, mở `http://localhost:5173`. Vite dùng 5173; API dùng 3001. `Ctrl+C` dừng các tiến trình đã chạy. Khi thiếu adapter, landing vẫn xem được nhưng sign-in và API dữ liệu bị khóa.

Không cần `.env` để xem landing. `.env.example` chỉ có placeholder; nếu copy thành `.env`, hãy thay tất cả placeholder trước khi chạy. Không commit `.env`, database hoặc file trong `.setup/`.

### TideCloak thực: local Windows hoặc instance HTTPS truy cập được

Cloud localhost khác localhost trên máy bạn. Không dùng địa chỉ localhost máy bạn làm endpoint cho backend cloud. Cần browser của bạn truy cập được cả app và TideCloak để tự nhập thông tin đăng nhập trong enclave. Phiên Codex web này không cung cấp thao tác người dùng đăng nhập qua localhost cloud.

Nếu chọn Docker Desktop trên Windows, dùng Linux containers và kiểm tra `docker info`. Tạo container riêng có volume bền vững. Nhập mật khẩu bootstrap trực tiếp trong terminal, không vào chat:

```powershell
$env:KC_BOOTSTRAP_ADMIN_USERNAME = "admin"
$credential = Read-Host "Bootstrap admin password" -AsSecureString
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $credential).Password

docker run -d --name consentvault-identity -p 127.0.0.1:8080:8080 --mount type=volume,source=consentvault-tide-data,target=/opt/keycloak/data/h2 -e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD tideorg/tidecloak-dev:latest
```

Nếu container đã tồn tại, dùng `docker start consentvault-identity`; không xóa volume hay chạy script wipe. Với TideCloak HTTPS có sẵn, bỏ phần Docker, dùng URL mà cả browser và backend truy cập được.

### Bootstrap realm mới, không xóa realm cũ

Script `scripts/bootstrap-tide.mjs` dựa trên template chính thức và **chỉ thêm realm mới vào instance hiện hữu**. Không gọi `docker rm`, không wipe H2, không dùng default email hay tự nhận đồng ý điều khoản. Email và sự đồng ý đã được chủ dự án cung cấp trong phiên này; dùng đúng lựa chọn đó khi chạy lại. Trên máy riêng, đặt các biến bằng dữ liệu của bạn:

```powershell
$env:TIDECLOAK_URL = "http://localhost:8080"
$env:REALM_NAME = "consentvault-tide"
$env:CLIENT_NAME = "consentvault"
$env:APP_ORIGIN = "http://localhost:5173"
$env:TIDE_LICENSE_EMAIL = Read-Host "Email quan ly license Tide"
# Chỉ đặt yes sau khi chính bạn đã đồng ý https://tide.org/legal
$env:TIDE_TERMS_ACCEPTED = "yes"
npm.cmd run tide:prepare
```

Script dừng nếu license yêu cầu trả phí; không tự đi theo checkout. Nếu mạng từ chối, giữ nguyên state trong `.setup/`, sửa network rồi kiểm tra trạng thái trước khi chạy lại; không tạo email/realm khác để lách giới hạn license. `setUpTideRealm` có thể để lại IdP chưa hoàn tất dù trả lỗi: không retry liên tục hoặc xóa IdP/keys của realm đã dùng; cần kiểm tra license, vendor keys và người dùng, sao lưu trước mọi sửa chữa. Trên cloud hiện tại đã sao lưu riêng IdP dang dở của realm mới, các realm cũ giữ nguyên.

Sau khi provision thành công, lời mời liên kết admin được lưu **riêng tư** tại `.setup/enrollment.json`, không in trong log. Mở lời mời trực tiếp từ máy chạy instance mà browser truy cập được. Đây là credential một lần: không commit, không paste vào chat. Bạn tự tạo/liên kết tài khoản Tide và giữ mật khẩu/recovery của mình trong enclave. Khi đến bước này, chọn branding và những thông tin muốn thu từ người dùng; không tự tạo email placeholder cho họ.

Sau liên kết:

```powershell
npm.cmd run tide:complete
npm.cmd run check:tide
```

Bootstrap đánh dấu `iga.attestor=tide`, bật IGA đúng một lần, hoàn tất first-admin ceremony và export adapter qua `keycloak-oidc-keycloak-json`. Nó không tự phê duyệt thay người dùng trong chế độ multiAdmin. File `app/tidecloak.json` bị Git ignore và phải có `jwk` Ed25519, `vendorId`, `homeOrkUrl` và `client-origin-auth-<origin>` do Tide ký. `tidecloak.example.json` chỉ mô tả hình dạng; không tự điền giá trị giả. Thay origin cần ký/export lại, không sửa chuỗi trong adapter.

Nếu `check:tide` trả exit 2, cấu hình chưa đủ. Backend chỉ dùng **embedded JWKS**, không fetch certs từ server làm fallback. Thuật toán token là EdDSA; realm template bật sender-bound DPoP, frontend dùng strict ES256 proof và API xác minh proof thực.

### Roles và quorum

Trong Tide console của realm, cấu hình các identity thật:

| Người | Role ứng dụng | Role Fabric |
|---|---|---|
| Lan | contributor | `_tide_encryptor`, `_tide_decryptor`, `_tide_enabled` |
| An | researcher | `_tide_decryptor`, `_tide_enabled` |
| Bình | researcher | `_tide_decryptor`, `_tide_enabled` |
| Operator | operator | `_tide_enabled`; không tự có quyền đọc |
| Quản trị viên chính sách độc lập | client role `tide-realm-admin` trên `realm-management` | `_tide_enabled` |

Không đưa `_tide_encryptor`/`_tide_decryptor` vào default roles. Mỗi người cần đăng nhập để ứng dụng ghi nhận `tideuserkey` đúng từ token; không tự nhập hoặc đổi định dạng key. Role chỉ là điều kiện cần; không có policy đúng người/record thì ORK phải từ chối.

Thêm các admin **độc lập** và authorize các thay đổi qua console/enclave. Kiểm tra threshold trong **M0 admin policy đã ký và đang có hiệu lực** ít nhất 2. Không suy ra từ số người: công thức fallback `floor(0.7 × admins)` có thể vẫn là 1 với hai admin. Cần commit `REGEN_ADMIN_POLICY` tương ứng. App không tự tạo nhiều tài khoản admin giả để tuyên bố có quorum.

Với một request nhạy cảm, thử ký một admin rồi xác nhận chưa được thực thi; đạt threshold với các admin độc lập tiếp theo rồi mới được thực thi. Đây là kiểm chứng bắt buộc, hiện chưa thực hiện.

## Sử dụng ConsentVault sau khi setup thật

1. Lan đăng nhập. **My contributions → Request record policy** chỉ gửi loại bản ghi, chưa gửi nội dung.
2. Một admin độc lập vào **Governance → Authorize in Tide enclave**. App lấy M0 policy bằng token/DPoP của chính admin và yêu cầu ký policy `RelationshipAttestation:1` cho Lan trên record đó. Backend kiểm tra chữ ký, subject, record, quyền và expiry.
3. Lan refresh, chọn **Encrypt contribution**, nhập sample giả rồi **Encrypt & save**. `IAMService.doEncrypt` nhận policy đã ký và đúng một tag là record ID. Server nhận ciphertext.
4. An đăng nhập để ghi nhận Tide identity. Lan chọn **Request sharing**, xác nhận An và record. Đây là consent của Lan ở tầng app; không phải chữ ký mạng của Lan.
5. Admin độc lập ký policy **read-only** cho An trên đúng record 1. An vào **Shared with me → Decrypt with Tide**. Record 2 không có policy cho An; Bình không có policy nào.
6. Operator thử self-grant sẽ nhận 403. Một admin không được upload policy cấp quyền cho chính mình. Live quorum vẫn cần kiểm chứng riêng ở Tide; không gọi các guard của ứng dụng là bằng chứng quorum.

Policy mẫu có hạn một giờ. Có thể request lại owner policy khi hết hạn. Chưa có luồng quản lý gia hạn reader/thu hồi hoàn chỉnh. Xóa policy row không phải thu hồi mật mã; plaintext người nhận đã lưu không thể lấy lại.

## Kiểm tra và production build

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:tide
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm.cmd run test:browser
```

`npm test` là kiểm tra API/serialization/chữ ký fixture, không phải Tide live. Browser check cần `npm run dev` đang chạy, không nhập credential. DPoP relay được copy byte-exact từ SDK; build kiểm tra SHA-256 và không bỏ qua integrity. Vite proxy toàn bộ `/tide_dpop/...` tới route SDK kèm CSP chính xác.

`npm start` phục vụ build/API trên một origin. Nếu đổi sang `http://localhost:3001`, cần đăng ký origin đó và export adapter tương ứng. Database ở `data/consentvault-policy.sqlite`; replay JTI lưu bền vững trong SQLite. Backup nhất quán DB cùng realm/Tide account; không tự dựng lại private key.

Theo Plan C, có thể quay và nộp demo mô phỏng có ghi nhãn rõ. Các [kiểm tra live còn thiếu](VERIFICATION.md) vẫn phải hoàn tất trước khi tuyên bố Tide network đã thực thi bảo mật hoặc dùng dữ liệu nghiên cứu thật. Không tự merge hoặc nộp bài.
