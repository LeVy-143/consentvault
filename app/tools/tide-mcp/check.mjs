import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client=new Client({name:'ConsentVault-guidance-verification',version:'0.1.0'},{capabilities:{}});
const hosted=process.argv.includes('--hosted');
try {
  await client.connect(hosted
    ? new StreamableHTTPClientTransport(new URL('https://mcp.tide.org/mcp'))
    : new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./node_modules/@tideorg/mcp/mcp-server/dist/index.js',import.meta.url))]}));
  const server=client.getServerVersion();
  console.log(`PASS MCP initialize: ${server.name} ${server.version}`);
  const listed=await client.listTools();
  assert.ok(listed.tools.some(t=>t.name==='tide_choose_playbook'));
  console.log(`PASS tools/list: ${listed.tools.length} Tide tools`);
  for(const [name,args,expected] of [['tide_canon',{name:'invariants'},'Embedded JWKS'],['tide_list',{category:'playbooks'},'setup-forseti-e2ee'],['tide_playbook',{name:'setup-forseti-e2ee'},'RelationshipAttestation:1']]) {
    const result=await client.callTool({name,arguments:args});
    const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
    assert.ok(!result.isError && text.includes(expected),`${name} returned real Tide guidance`);
    console.log(`PASS tools/call ${name}: verified Tide guidance (${text.length} characters)`);
  }
  console.log(`${hosted ? 'Hosted HTTP' : 'Local stdio'} MCP works. This does not install tools into an existing Codex web session.`);
} finally { await client.close(); }
