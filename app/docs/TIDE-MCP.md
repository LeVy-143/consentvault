# Kết nối Tide MCP trong môi trường này

Đã kiểm tra ngày 22/10/2026.

| Phần | Kết quả thực tế |
|---|---|
| Codex CLI | `/opt/codex/bin/codex`, phiên bản 0.163.0; có lệnh `mcp` |
| `codex mcp add tide --url https://mcp.tide.org/mcp` | Thất bại: `/run/codex-environment/codex-home/config.toml` thuộc filesystem chỉ đọc |
| `codex mcp get tide --json` sau đó | Không có entry tide được lưu |
| `codex -c 'mcp_servers.tide.url="https://mcp.tide.org/mcp"' mcp get tide --json` | CLI nhận cấu hình cho riêng invocation; không phải kiểm tra kết nối |
| Hosted MCP qua HTTP | **Hoạt động**: initialize xác nhận @tideorg/mcp 1.9.33, tools/list có 22 tools, tools/call trả playbook Tide |
| MCP local stdio, gói chính thức | **Hoạt động**: `@tideorg/mcp@1.9.33`, initialize thành công, tools/list có 22 tools, tools/call trả nội dung Tide |
| Công cụ Tide native trong phiên Codex web | Không có; cấu hình CLI không tự đăng ký công cụ cho phiên web đang chạy |

## Kiểm tra lại local MCP

Từ `app/`:

```powershell
npm.cmd run mcp:install
npm.cmd run mcp:check
npm.cmd run mcp:check:hosted
```

`tools/tide-mcp/check.mjs` dùng MCP SDK Client thật, chọn server stdio hoặc hosted HTTP rồi chạy initialize → tools/list → tools/call. Nó xác minh nội dung đặc trưng Tide ở kết quả `tide_canon`, `tide_list` và `tide_playbook`; không coi việc cài package hay ghi config là đủ. Chế độ hosted dùng Node 24 `--use-env-proxy` để tuân theo proxy của môi trường nếu có.

Các tool đã dùng trong công việc gồm `tide_adapter`, `tide_canon`, `tide_choose_playbook`, `tide_choose_scenario`, `tide_scenario`, `tide_scenario_roles`, `tide_scenario_bootstrap`, `tide_playbook`, `tide_dpop_asset` và `tide_doctor`. Đây là công cụ đọc hướng dẫn, không có quyền provision realm hay tạo chữ ký thay admin.

Nguồn fallback local được trang chính thức hỗ trợ: https://tide.org/tide-agent-pack.md. Package được cài với lockfile/integrity, không tắt TLS/chữ ký/checksum.

## Những điều hướng dẫn đã làm thay đổi

- Dùng adapter Tide với embedded Ed25519 JWKS, bỏ remote-JWKS fallback của bản trước.
- DPoP bật đồng bộ client/realm, API kiểm tra chữ ký proof, `cnf.jkt`, `ath`, `htm`, `htu`, `iat`, `jti`; chống replay qua SQLite.
- Bỏ local RSA key bundle/offline decrypt. Dùng policy `RelationshipAttestation:1` theo User và assignmentId/record ID.
- Sign policy trong browser/enclave của realm admin, không có endpoint server ký giả hoặc credential master-admin trong API app.
- Owner consent là request ở backend; grant của Fabric cần admin ký. Không gọi việc một owner bấm share là Tide đã cấp quyền.
- Quorum đọc từ policy được ký, không suy từ số admin hoặc menu UI. Policy declaring threshold >=2 vẫn không thay được kiểm chứng policy đang active và một admin bị từ chối thật.

## Network và giới hạn hiện tại

Trang Tide, docs, config cuộc thi và hosted MCP hiện truy cập được. Lỗi 403 hosted ở đầu phiên đã hết; kết nối thực đã được kiểm tra lại, không suy từ việc lưu allowlist.

`ork1.tideprotocol.com` trả HTTP 200 từ máy cloud nhưng InitializeWallet **bên trong container** vẫn gặp proxy tunnel 403. Đã thêm CA công khai của proxy vào trust store container, giữ kiểm tra TLS; lỗi TLS trước đó đã hết. Chưa xác nhận license/VRK và chưa có invite. Lưu draft không chứng minh đường mạng container hoặc mã hóa Fabric hoạt động.
