# Video ConsentVault — hai phút

**Chưa quay video end-to-end:** chỉ quay khi có Tide adapter thật, tài khoản Tide độc lập và các kiểm tra network trong VERIFICATION.md đã đạt. Không dùng fixture JWT/ciphertext, role switcher hay chữ ký tự tạo để giả lập cảnh thành công.

Chuẩn bị trước: Lan có hai record synthetic đã mã hóa với owner policies; An/Bình đã đăng nhập; các admin độc lập có M0 policy active threshold >=2. Dùng browser profiles riêng. Gia hạn policy trước khi quay nếu đã hết hạn một giờ.

| Thời gian | Màn hình/thao tác | Lời dẫn |
|---|---|---|
| 0:00–0:15 | Landing, hai thẻ minh họa | “ConsentVault dành cho nghiên cứu tiếng Việt dùng dữ liệu giả. Quyền đồng ý áp dụng cho từng bản ghi và từng người.” |
| 0:15–0:35 | Lan đăng nhập TideCloak thật; My contributions, hai bản ghi | “Lan giữ khảo sát riêng tư. Nội dung được mã hóa bằng Tide trong browser; server chỉ lưu ciphertext.” |
| 0:35–0:55 | Lan Request sharing đúng record 1 cho An | “Đây là consent của Lan được backend kiểm tra. Nó chưa phải quyền decrypt. Bản ghi khảo sát không được chọn.” |
| 0:55–1:15 | Governance, admin độc lập Authorize in Tide enclave | “Tide ký policy cho đúng user key của An, đúng record và quyền read-only, dưới chính sách quản trị. Nếu chưa đủ quorum, không được giả vờ đã cấp quyền.” |
| 1:15–1:35 | An: Shared with me → Decrypt with Tide | “An đọc record 1 qua Fabric. API không cho An lấy record 2; policy của record 1 không dùng cho record 2.” |
| 1:35–1:45 | Bình: Shared with me trống | “Cùng có role researcher vẫn không đủ. Bình chưa được cấp policy nào.” |
| 1:45–2:00 | Operator: self-grant guard 403; bằng chứng quorum thật | “Vận hành dịch vụ không cho quyền đọc. Quorum quản trị khác consent nghiệp vụ. Bản sao plaintext người nhận lưu không thể thu hồi.” |

Có thể cắt bớt thời gian chờ ceremony khi dựng video, nhưng chỉ dùng footage của các thao tác thực và ghi rõ nếu có đoạn chờ được cắt. Không dựng trạng thái Approved trong React.

Dữ liệu dùng nút “Use a synthetic sample”. Không nhập dữ liệu nghiên cứu thật. Kết quả “một admin chưa đủ” phải lấy từ live Tide, không dùng số đếm hoặc kết quả fixture làm bằng chứng.
