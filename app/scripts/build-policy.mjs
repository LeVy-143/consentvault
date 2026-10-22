// The official browser SDK contains extensionless ESM imports. Bundle its policy codec for Node.
// Keep the SDK's serializer; never hand-roll policy bytes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const relay = readFileSync('node_modules/@tidecloak/js/tide_dpop_auth.html');
if (createHash('sha256').update(relay).digest('hex') !== '9d7844b938f0a2565fa910d3d30e9b8797cbfd6e0b73d59d804169a089aea757') throw new Error('SDK DPoP relay differs from the verified Tide Agent Pack asset. Review the SDK/version; never bypass integrity verification.');
writeFileSync('public/tide_dpop_auth.html', relay);
await build({ entryPoints: ['shared/relationship.mjs'], outfile: '.generated/relationship.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node24', treeShaking: true });
