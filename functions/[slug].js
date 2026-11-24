import { CLIENTS } from './_clients.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ request, params, env }) {
  const url = new URL(request.url);
  const slug = String(params.slug || '').toLowerCase();
  const api = CLIENTS[slug];

  // Not a shop (e.g. /app.js, /style.css, unknown path): serve normally
  if (!api) return env.ASSETS.fetch(request);

  // /Malabar -> /malabar
  if (params.slug !== slug) {
    url.pathname = '/' + slug;
    return Response.redirect(url.toString(), 301);
  }

  // Menu + settings from Apps Script, cached at the edge for 60s
  let data = null;
  try {
    const res = await fetch(api, { cf: { cacheTtl: 60, cacheEverything: true } });
    const json = await res.json();
    if (json && json.ok) data = json;
  } catch (_) { /* page still loads; app shows a reload message */ }

  const s = (data && data.settings) || {};
  const name = s['Shop Name'] || 'Order Online';
  const title = `${name} — Order Online`;
  const desc = s['Tagline'] || 'Browse the menu and order directly on WhatsApp.';
  let img = s['Share Image URL'] || s.banner || s.logo || '';
  if (!/^https:\/\//i.test(img)) img = '';

  const meta = `
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url.origin + '/' + slug)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`;
  const boot = `<script>window.__SHOP__=${JSON.stringify({ slug, data }).replace(/</g, '\\u003c')};</script>`;

  const page = await env.ASSETS.fetch(new URL('/', request.url));
  const out = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[property^="og:"], meta[name="description"]', { element(el) { el.remove(); } })
    .on('head', { element(el) { el.append(meta + boot, { html: true }); } })
    .transform(new Response(page.body, page));

  out.headers.set('Cache-Control', 'public, max-age=60');
  return out;
}
