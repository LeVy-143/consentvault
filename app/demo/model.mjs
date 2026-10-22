// Synthetic identities only. These are intentionally impersonable in the local demo.
export const DEMO_BANNER = 'Demo mode — Tide protections simulated';
export const identities = Object.freeze([
  { id: 'lan', name: 'Lan', role: 'contributor' },
  { id: 'an', name: 'An', role: 'researcher' },
  { id: 'binh', name: 'Bình', role: 'researcher' },
  { id: 'operator', name: 'Operator', role: 'operator' },
  { id: 'admin-1', name: 'Admin 1', role: 'admin' },
  { id: 'admin-2', name: 'Admin 2', role: 'admin' },
]);
export const samples = Object.freeze({
  'Vietnamese text': 'Dữ liệu giả: Mỗi buổi sáng, tôi đi bộ qua công viên và nghe tiếng chim hót. Thành phố vẫn còn yên tĩnh.',
  'Private survey': 'Dữ liệu hoàn toàn giả: Tôi cảm thấy lo lắng khi nói trước đám đông, nhưng tự tin hơn khi trò chuyện với bạn bè.',
});
