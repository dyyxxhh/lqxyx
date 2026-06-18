import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip } from 'node:zlib';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');
const indexPath = join(distDir, 'index.html');
const host = process.env.HOST ?? '0.0.0.0';
const requestedPort = Number.parseInt(process.env.PORT ?? process.argv[2] ?? '8949', 10);
const port = Number.isNaN(requestedPort) ? 8949 : requestedPort;

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const compressibleExtensions = new Set(['.html', '.css', '.js']);

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

function acceptsEncoding(request, encoding) {
  const acceptEncoding = request.headers['accept-encoding'];

  if (!acceptEncoding) {
    return false;
  }

  return acceptEncoding
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .some((token) => {
      const [name, ...parameters] = token.split(';').map((part) => part.trim());
      const quality = parameters.find((parameter) => parameter.startsWith('q='));

      return name === encoding && quality !== 'q=0' && quality !== 'q=0.0';
    });
}

function getCompression(request, filePath) {
  if (!compressibleExtensions.has(extname(filePath).toLowerCase())) {
    return null;
  }

  if (acceptsEncoding(request, 'br')) {
    return { encoding: 'br', stream: createBrotliCompress() };
  }

  if (acceptsEncoding(request, 'gzip')) {
    return { encoding: 'gzip', stream: createGzip() };
  }

  return null;
}

function writeHeaders(response, statusCode, headers) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    ...headers
  });
}

function sendFile(request, response, filePath, statusCode = 200) {
  const compression = getCompression(request, filePath);
  const headers = {
    'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'Cache-Control': filePath === indexPath ? 'no-cache, must-revalidate' : 'public, max-age=31536000, immutable'
  };

  if (compression) {
    headers['Content-Encoding'] = compression.encoding;
    headers.Vary = 'Accept-Encoding';
  }

  writeHeaders(response, statusCode, headers);

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const fileStream = createReadStream(filePath);

  if (compression) {
    fileStream.pipe(compression.stream).pipe(response);
    return;
  }

  fileStream.pipe(response);
}

function resolveAssetPath(requestPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }

  const normalizedPath = normalize(decodedPath).replace(/^[/\\]+/, '');
  const assetPath = resolve(distDir, normalizedPath);

  if (assetPath !== distDir && !assetPath.startsWith(`${distDir}${sep}`)) {
    return null;
  }

  return assetPath;
}

const server = createServer((request, response) => {
  if (!existsSync(indexPath)) {
    writeHeaders(response, 503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('dist/index.html not found. Run npm run build first.');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    writeHeaders(response, 405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const assetPath = resolveAssetPath(request.url ?? '/');

  if (assetPath && existsSync(assetPath) && statSync(assetPath).isFile()) {
    sendFile(request, response, assetPath);
    return;
  }

  sendFile(request, response, indexPath);
});

server.listen(port, host, () => {
  console.log(`Static server listening at http://${host}:${port}/`);
  console.log(`Serving ${distDir}`);
});
