import React from 'react';
import { createRoot } from 'react-dom/client';
import { TideCloakContextProvider } from '@tidecloak/react';
import App from './App.jsx';
import './style.css';
const root = createRoot(document.getElementById('root'));
const demoBuild = import.meta.env.MODE === 'demo';
root.render(<>{demoBuild && <aside className="demo-banner"><strong>Demo mode — Tide protections simulated</strong></aside>}<div className="startup">Opening ConsentVault…</div></>);
async function bootstrap() { try {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Service unavailable');
  const setup = await response.json();
  if ((setup.mode === 'demo') !== demoBuild) throw new Error('App/server mode mismatch');
  if (demoBuild) { root.render(<App setup={setup}/>); return; }
  root.render(setup.configured
    ? <TideCloakContextProvider config={setup.config}><App setup={setup}/></TideCloakContextProvider>
    : <App setup={setup}/>);
} catch {
  if (demoBuild) { root.render(<><aside className="demo-banner"><strong>Demo mode — Tide protections simulated</strong></aside><div className="startup" role="alert">The local demo API is unavailable. Restart npm run dev:demo.</div></>); return; }
  root.render(<App setup={{ configured: false, encryptionConfigured: false, unavailable: true }}/>);
} }
bootstrap();
