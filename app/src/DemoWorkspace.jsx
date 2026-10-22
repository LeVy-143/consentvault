import { useEffect, useState } from 'react';
import { identities } from '../demo/model.mjs';

export default function DemoWorkspace({ identity, page }) {
  const [data, setData] = useState({ owned: [], shared: [], catalog: [], requests: [], audit: [] });
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const [content, setContent] = useState({}), [sharing, setSharing] = useState(null), [recipient, setRecipient] = useState('an');
  const [confirmed, setConfirmed] = useState(false), [resetting, setResetting] = useState(false);
  const [kind, setKind] = useState('Vietnamese text');
  async function api(path, body) {
    const response = await fetch(`/api/demo${path}`, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { 'X-ConsentVault-Demo': 'local-simulation', 'X-Demo-Identity': identity.id, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Demo operation failed.');
    return result;
  }
  async function load() {
    const [owned, shared, catalog, requests, audit] = await Promise.all([
      api('/records?scope=owned'), api('/records?scope=shared'), api('/records?scope=catalog'), api('/requests'), api('/audit'),
    ]);
    setData({ owned, shared, catalog, requests, audit });
  }
  async function perform(work) {
    setBusy(true); setProblem(''); setNotice('');
    try { await work(); } catch (error) { setProblem(error.message); }
    finally { try { await load(); } catch { setProblem('The local demo API is unavailable. Restart npm run dev:demo.'); } setBusy(false); }
  }
  useEffect(() => { perform(async () => { await api('/identity', {}); }); }, []);
  useEffect(() => { setContent({}); setSharing(null); setProblem(''); setNotice(''); setResetting(false); }, [page]);
  async function open(record) {
    await perform(async () => {
      const result = await api(`/records/${record.id}/open`, {});
      setContent(current => ({ ...current, [record.id]: result.content }));
      setNotice(`Access allowed for ${identity.name}: ${record.kind}. Local simulation, not Tide decryption.`);
    });
  }
  async function share(event) {
    event.preventDefault(); if (!sharing || !confirmed) return;
    await perform(async () => {
      await api(`/records/${sharing.id}/requests`, { recipient });
      setSharing(null); setNotice('Owner consent recorded. Pending: 0/2 distinct demo admin approvals. No reader access yet.');
    });
  }
  function card(record, accessCheck = false) {
    return <article className="record-card" key={record.id} data-record-id={record.id}>
      <div className="record-head"><span className="chip">{record.canOpen ? 'Access allowed' : 'No read grant'}</span><small>SIMULATED PROTECTION</small></div>
      <h3>{record.kind}</h3><p className="muted">{record.id.slice(0, 8)} · Synthetic contribution from Lan</p>
      {content[record.id] ? <div className="decrypted" lang="vi">{content[record.id]}</div> : <div className="cipher-preview">Content hidden · local demo storage</div>}
      {record.recipients.length > 0 && <p className="recipient-list">Active reader: {record.recipients.map(id => identities.find(i => i.id === id)?.name).join(', ')}</p>}
      <div className="record-actions">
        <button className="button small secondary" disabled={busy} onClick={() => open(record)}>{accessCheck ? 'Try opening record' : 'Open contribution'}</button>
        {content[record.id] && <button className="text-button" onClick={() => setContent(current => { const next = { ...current }; delete next[record.id]; return next; })}>Hide content</button>}
        {identity.id === record.owner && <button className="text-button" disabled={busy} onClick={() => { setSharing(record); setRecipient('an'); setConfirmed(false); }}>Request sharing</button>}
        {identity.id !== record.owner && accessCheck && <button className="text-button" disabled={busy} onClick={() => perform(async () => { await api(`/records/${record.id}/requests`, { recipient: identity.id }); })}>Try self-grant</button>}
      </div>
    </article>;
  }
  const titles = { owned: 'My contributions', shared: 'Shared with me', governance: 'Governance' };
  return <>
    <section className="page-heading"><div className="eyebrow">LOCAL DEMO · {identity.name.toUpperCase()} · {identity.role.toUpperCase()}</div><h1>{titles[page]}</h1>
      <p>Synthetic identities and Tide protections are simulated. The local backend checks every action against stored consent and approvals.</p></section>
    <div aria-live="polite">
      {notice && <div className="notice success" role="status">{notice}</div>}
      {problem && <div className="notice error" role="alert">{problem}</div>}
    </div>
    <section className="vault-status"><div><strong>No Tide network connection required</strong><p>This demo server can decrypt its local storage. It does not provide Tide end-to-end encryption or real independent administrator authentication.</p></div>
      <button className="button small secondary" disabled={busy} onClick={() => { setContent({}); perform(async () => {}); }}>Clear content & refresh</button></section>
    {page === 'owned' && <>
      {identity.role === 'contributor' ? <form className="contribute" onSubmit={event => { event.preventDefault(); perform(async () => { await api('/records', { kind }); setNotice('Synthetic contribution created. Only its owner can open it.'); }); }}>
        <div><div className="eyebrow">SYNTHETIC DATA ONLY</div><h2>One record. One clear permission.</h2><p>Create the passage and private survey for the video. Real participant data is not accepted.</p></div>
        <div className="contribute-fields"><label>Record type<select value={kind} onChange={event => setKind(event.target.value)}><option>Vietnamese text</option><option>Private survey</option></select></label>
          <button className="button" disabled={busy}>Add synthetic contribution</button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => perform(async () => {
            for (const sampleKind of ['Vietnamese text', 'Private survey']) await api('/records', { kind: sampleKind });
            setNotice('Two synthetic contributions created for Lan. Neither has a reader grant.');
          })}>Create two sample records</button></div>
      </form> : <div className="empty-inline">Only Lan has the contributor role. Switching a display identity does not change the server-side role catalog.</div>}
      <div className="collection-heading"><h2>Your records</h2><span className="chip">{data.owned.length} records</span></div>
      <div className="record-grid">{data.owned.map(record => card(record))}</div>
      {!data.owned.length && <p className="empty-inline">No contributions for this identity.</p>}
    </>}
    {sharing && <form className="demo-share policy-card" onSubmit={share} aria-label="Request reader access">
      <h2>Share only {sharing.kind}</h2><p>Consent applies to this record and this named recipient. Two distinct demo admins must then approve.</p>
      <label>Researcher<select value={recipient} onChange={event => { setRecipient(event.target.value); setConfirmed(false); }}><option value="an">An</option><option value="binh">Bình</option></select></label>
      <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/>I consent to share only this record with this researcher.</label>
      <div className="form-actions"><button className="button" disabled={busy || !confirmed}>Record my consent</button><button className="text-button" type="button" onClick={() => setSharing(null)}>Cancel sharing</button></div>
    </form>}
    {page === 'shared' && <>
      <div className="collection-heading"><h2>Granted to {identity.name}</h2><span className="chip">{data.shared.length} records</span></div>
      <div className="record-grid">{data.shared.map(record => card(record))}</div>
      {!data.shared.length && <p className="empty-inline">No active reader grants for this identity.</p>}
    </>}
    {page === 'governance' && <section className="section governance">
      <div className="governance-grid"><article className="policy-card"><span className="chip teal">OWNER CONSENT · APP LOGIC</span><h2>Only Lan requests a reader.</h2><p>Consent starts a record-specific request. It does not activate access. Operators and researchers cannot create their own reader grant.</p></article>
        <article className="policy-card external"><span className="chip amber">2-ADMIN RULE · SIMULATED</span><h2>Two distinct approvals.</h2><p>The backend stores one approval per demo admin. Admin 1 alone leaves the request pending. Admin 2 activates only the requested reader and record.</p><p>This models the intended governance boundary. It is not a network signature, ORK quorum, or proof of live Tide enforcement.</p></article></div>
      <div className="audit-head"><h2>Owner-requested access</h2><span className="muted">Approvals are persisted by the demo backend.</span></div>
      <div className="request-list">{data.requests.map(request => <article className="record-card" key={request.id} data-request-id={request.id}>
        <span className={`chip ${request.status === 'active' ? 'teal' : 'amber'}`}>{request.status} · {request.approvals.length}/2 approvals</span>
        <h3>{request.kind} → {request.recipientName}</h3><p className="muted">Record {request.recordId.slice(0, 8)} · Read-only · Consent by Lan</p>
        <p>Approved by: {request.approvals.map(id => identities.find(i => i.id === id).name).join(', ') || 'Nobody yet'}</p>
        {identity.role === 'admin' && request.status === 'pending' && <button className="button small" disabled={busy} onClick={() => perform(async () => {
          const result = await api(`/requests/${request.id}/approve`, {});
          setNotice(result.status === 'active' ? '2/2 distinct demo admins approved. The named reader grant is now active.' : '1/2 admin approved. Still pending; the researcher cannot open the record.');
        })}>{request.approvals.includes(identity.id) ? 'Try duplicate approval' : 'Approve as ' + identity.name}</button>}
        {identity.role !== 'admin' && request.status === 'pending' && <button className="button small secondary" disabled={busy} onClick={() => perform(async () => { await api(`/requests/${request.id}/approve`, {}); })}>Try approving as {identity.name}</button>}
      </article>)}</div>
      {!data.requests.length && <p className="empty-inline">No consent requests yet. Switch to Lan and request sharing from My contributions.</p>}
    </section>}
    {(page === 'shared' || page === 'governance') && <section className="section demo-access-checks">
      <div className="audit-head"><h2>Synthetic access checks</h2><span className="muted">Catalog shows metadata only; opening a record makes a real local API request.</span></div>
      <div className="record-grid">{data.catalog.map(record => card(record, true))}</div>
      {!data.catalog.length && <p className="empty-inline">Switch to Lan to create two sample records first.</p>}
    </section>}
    <section className="section"><div className="audit-head"><h2>Demo activity log</h2><span className="muted">Successes, pending approvals and denied operations · all synthetic identities</span></div>
      <div className="audit demo-audit">{data.audit.map(event => <div key={event.id} data-outcome={event.outcome}>
        <span className={`chip ${event.outcome === 'denied' ? 'amber' : 'teal'}`}>{event.outcome}</span><strong>{event.actorName} · {event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
        <span>{event.reason}{event.record_id ? ` Record ${event.record_id.slice(0, 8)}.` : ''}</span><time>{new Date(event.created).toLocaleTimeString()}</time>
      </div>)}</div>
    </section>
    {page === 'governance' && <aside className="setup-note"><strong>Prepare another recording</strong><p>Reset only the separate synthetic demo database. Live data and Tide configuration are untouched.</p>
      {resetting ? <div className="form-actions"><button className="button small" disabled={busy} onClick={() => perform(async () => { await api('/reset', { confirmation: 'RESET_SYNTHETIC_DEMO' }); setContent({}); setResetting(false); setNotice('Synthetic demo reset. Switch to Lan to start again.'); })}>Confirm reset synthetic demo</button><button className="text-button" onClick={() => setResetting(false)}>Cancel reset</button></div>
        : <button className="button small secondary" onClick={() => setResetting(true)}>Reset demo</button>}
    </aside>}
  </>;
}
