#!/usr/bin/env node

const API = 'https://www.googleapis.com/customsearch/v1';

function parseArgs(argv) {
  const out = { num: 5, start: 1, safe: 'off' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '-q') out.query = argv[++i];
    else if (a === '--num') out.num = Number(argv[++i]);
    else if (a === '--start') out.start = Number(argv[++i]);
    else if (a === '--site') out.site = argv[++i];
    else if (a === '--safe') out.safe = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage(msg) {
  if (msg) console.error(msg);
  console.error(`Usage: google_search.js --query "..." [--num 5] [--start 1] [--site example.com] [--safe active|off]`);
  process.exit(msg ? 2 : 0);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) usage();
  if (!args.query) usage('Missing --query');

  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!key) usage('Missing GOOGLE_API_KEY');
  if (!cx) usage('Missing GOOGLE_SEARCH_ENGINE_ID');

  const num = Math.max(1, Math.min(10, Number(args.num) || 5));
  const start = Math.max(1, Number(args.start) || 1);
  const q = args.site ? `site:${args.site} ${args.query}` : args.query;

  const url = new URL(API);
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', q);
  url.searchParams.set('num', String(num));
  url.searchParams.set('start', String(start));
  url.searchParams.set('safe', args.safe === 'active' ? 'active' : 'off');

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error(JSON.stringify({ error: `Network error: ${e?.message || String(e)}` }, null, 2));
    process.exit(1);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    console.error(JSON.stringify({ error: `Invalid JSON response: ${e?.message || String(e)}` }, null, 2));
    process.exit(1);
  }

  if (!res.ok || data.error) {
    console.error(JSON.stringify({ error: data.error || { code: res.status, message: res.statusText } }, null, 2));
    process.exit(1);
  }

  const out = {
    query: args.query,
    executedQuery: q,
    totalResults: Number(data.searchInformation?.totalResults || 0),
    items: (data.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
    })),
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
