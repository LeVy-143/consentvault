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

## Chạy demo local

```powershell
cd app
npm.cmd ci
npm.cmd run dev:demo
```

Mở **http://127.0.0.1:5174**. Cần Node.js 24; không cần Docker, license hay tài khoản Tide. Sau khi cài dependencies, demo không gọi Tide network. Banner luôn ghi **“Demo mode — Tide protections simulated”**.

- [Hướng dẫn Windows, chuyển danh tính và tích hợp live](app/README.md)
- [Kịch bản video hai phút](app/DEMO.md)
- [Báo cáo kiểm tra](app/VERIFICATION.md)
- [Ranh giới mô phỏng và các điểm nối Tide](app/docs/DEMO-MODE.md)
- [Thiết kế bảo mật live](app/docs/SECURITY.md)
- [Nguồn chính thức](app/docs/SOURCES.md)

Ứng dụng ở `app/`. FairEnrol tham khảo tại `RMIT-ConsentVault/reference/hackathon-main/hackathon-main/` giữ nguyên.

[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak)
