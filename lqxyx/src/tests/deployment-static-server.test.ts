/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const packageJson = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  scripts: Record<string, string>;
};
const ecosystemConfig = readFileSync('ecosystem.config.cjs', 'utf-8');
const parsedEcosystemConfig = require('../../ecosystem.config.cjs') as {
  apps: Array<{
    name: string;
    script: string;
    env: Record<string, string>;
    autorestart?: boolean;
    max_memory_restart?: string;
    max_restarts?: number;
    restart_delay?: number;
    min_uptime?: string;
    kill_timeout?: number;
  }>;
};
const staticServer = readFileSync('server/static-server.js', 'utf-8');
const distDir = 'dist';
const indexPath = join(distDir, 'index.html');
const testJsPath = join(distDir, 'assets', 'app-abcdef12.js');
const testCssPath = join(distDir, 'assets', 'style-abcdef12.css');

type StaticResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

let serverProcess: ReturnType<typeof spawn> | undefined;
let serverPort = 0;
let previousIndex: string | undefined;
let hadIndex = false;

async function getAvailablePort() {
  const probe = createServer();

  return new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }

        reject(new Error('Unable to allocate a test port'));
      });
    });
  });
}

function fetchStatic(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<StaticResponse>((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port: serverPort,
        path,
        method,
        headers
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    request.on('error', reject);
    request.end();
  });
}

beforeAll(async () => {
  hadIndex = existsSync(indexPath);
  previousIndex = hadIndex ? readFileSync(indexPath, 'utf-8') : undefined;

  mkdirSync(join(distDir, 'assets'), { recursive: true });
  writeFileSync(indexPath, '<!doctype html><script type="module" src="/assets/app-abcdef12.js"></script>', 'utf-8');
  writeFileSync(testJsPath, 'window.__STATIC_SERVER_TEST__ = true;', 'utf-8');
  writeFileSync(testCssPath, 'body { background: #111; }', 'utf-8');

  serverPort = await getAvailablePort();

  serverProcess = spawn('node', ['server/static-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(serverPort) },
    stdio: ['ignore', 'ignore', 'ignore']
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetchStatic('/');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error('Static server did not start in time');
});

afterAll(() => {
  serverProcess?.kill();
  if (existsSync(testJsPath)) {
    unlinkSync(testJsPath);
  }
  if (existsSync(testCssPath)) {
    unlinkSync(testCssPath);
  }

  if (hadIndex && previousIndex !== undefined) {
    writeFileSync(indexPath, previousIndex, 'utf-8');
  } else if (existsSync(indexPath)) {
    unlinkSync(indexPath);
  }
});

describe('production static deployment surface', () => {
  it('starts the production server directly with Node instead of Vite preview or serve CLI', () => {
    expect(packageJson.scripts['start:prod']).toBe('node server/static-server.js');
    expect(packageJson.scripts['serve:prod']).toContain('node server/static-server.js');
    expect(packageJson.scripts['serve:prod']).not.toContain('vite preview');
    expect(packageJson.scripts['serve:prod']).not.toContain('serve dist');
  });

  it('declares the pm2 app on the 8949 static server port', () => {
    expect(ecosystemConfig).toContain("name: 'ying-zhong-jiu-static'");
    expect(ecosystemConfig).toContain("script: './server/static-server.js'");
    expect(ecosystemConfig).toMatch(/HOST: '(127\.0\.0\.1|0\.0\.0\.0)'/);
    expect(ecosystemConfig).toContain("PORT: '8949'");
  });

  it('declares the pm2 production restart policy', () => {
    expect(parsedEcosystemConfig.apps).toHaveLength(1);

    const [app] = parsedEcosystemConfig.apps;

    expect(app).toMatchObject({
      name: 'ying-zhong-jiu-static',
      script: './server/static-server.js',
      autorestart: true,
      max_memory_restart: '512M',
      max_restarts: 5,
      restart_delay: 5000,
      min_uptime: '10s',
      kill_timeout: 5000
    });
    expect(app.env).toMatchObject({
      PORT: '8949'
    });
  });

  it('serves dist with SPA index fallback and no forbidden production source reference', () => {
    expect(staticServer).toContain("const distDir = resolve(rootDir, 'dist')");
    expect(staticServer).toContain("sendFile(request, response, indexPath)");
    expect(`${packageJson.scripts['serve:prod']}
${ecosystemConfig}
${staticServer}`).not.toContain('其他/');
  });

  it('declares security headers and compression support in the static server source', () => {
    expect(staticServer).toContain('X-Content-Type-Options');
    expect(staticServer).toContain('X-Frame-Options');
    expect(staticServer).toContain('Referrer-Policy');
    expect(staticServer).toContain('Content-Security-Policy');
    expect(staticServer).toContain('createGzip');
    expect(staticServer).toContain('createBrotliCompress');
  });

  it('sends security headers on static responses', async () => {
    const response = await fetchStatic('/');

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("img-src 'self' data: blob:");
  });

  it('keeps HTML fallback no-cache while hashed static assets remain immutable', async () => {
    const index = await fetchStatic('/');
    const fallback = await fetchStatic('/chapter/one');
    const asset = await fetchStatic('/assets/app-abcdef12.js');

    expect(index.headers['cache-control']).toBe('no-cache, must-revalidate');
    expect(fallback.headers['cache-control']).toBe('no-cache, must-revalidate');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('gzip-compresses HTML and JavaScript when requested', async () => {
    const html = await fetchStatic('/', { 'Accept-Encoding': 'gzip' });
    const script = await fetchStatic('/assets/app-abcdef12.js', { 'Accept-Encoding': 'gzip' });

    expect(html.headers['content-encoding']).toBe('gzip');
    expect(script.headers['content-encoding']).toBe('gzip');
    expect(html.headers.vary).toBe('Accept-Encoding');
    expect(gunzipSync(html.body).toString('utf-8')).toContain('<!doctype html>');
    expect(gunzipSync(script.body).toString('utf-8')).toContain('__STATIC_SERVER_TEST__');
  });

  it('prefers brotli-compressed CSS when the client advertises brotli', async () => {
    const response = await fetchStatic('/assets/style-abcdef12.css', { 'Accept-Encoding': 'gzip, br' });

    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers.vary).toBe('Accept-Encoding');
    expect(brotliDecompressSync(response.body).toString('utf-8')).toContain('background');
  });
});
