/**
 * Phase 8B.1 smoke probes against a running production server.
 * Usage: node scripts/phase8b1-smoke-http.mjs [baseUrl]
 */
const base = (process.argv[2] || 'http://127.0.0.1:3911').replace(/\/$/, '');

async function main() {
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.text();
  console.log(`HEALTH_STATUS=${health.status}`);
  console.log(`HEALTH_BODY=${healthBody}`);
  if (!health.ok) throw new Error('health failed');

  const spa = await fetch(`${base}/`);
  const spaText = await spa.text();
  console.log(`SPA_STATUS=${spa.status}`);
  console.log(`SPA_HAS_ROOT=${/id=["']root["']/.test(spaText)}`);
  if (!spa.ok) throw new Error('spa failed');

  const route = await fetch(`${base}/some-client-route`);
  const routeText = await route.text();
  console.log(`ROUTE_STATUS=${route.status}`);
  console.log(`ROUTE_HAS_ROOT=${/id=["']root["']/.test(routeText)}`);
  if (!route.ok) throw new Error('spa route failed');

  const assetMatch = spaText.match(/\/assets\/[^"'>\s]+\.js/);
  if (!assetMatch) throw new Error('No JS asset href in index.html');
  const asset = await fetch(`${base}${assetMatch[0]}`);
  const buf = await asset.arrayBuffer();
  console.log(`ASSET_PATH=${assetMatch[0]}`);
  console.log(`ASSET_STATUS=${asset.status}`);
  console.log(`ASSET_LEN=${buf.byteLength}`);
  if (!asset.ok || buf.byteLength < 1000) throw new Error('asset failed');

  console.log('SMOKE_OK');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
