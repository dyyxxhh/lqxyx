import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';

const evidenceDir = '.omo/evidence';
const sourcemapNegativeMode = process.argv.includes('--sourcemap-negative-test');
const evidencePrefix = sourcemapNegativeMode ? 'task-14-sourcemap-negative' : 'task-14-verify';
const summaryPath = join(evidenceDir, `${evidencePrefix}-summary.json`);
const markdownPath = join(evidenceDir, `${evidencePrefix}-summary.md`);
const rawLogPath = join(evidenceDir, `${evidencePrefix}-commands.log`);
const commandLogDir = join(evidenceDir, `${evidencePrefix}-logs`);
const startTime = new Date();

mkdirSync(commandLogDir, { recursive: true });

const summary = {
  task: 'Task 14 verification evidence pipeline',
  startedAt: startTime.toISOString(),
  finishedAt: null,
  durationMs: null,
  mode: sourcemapNegativeMode ? 'sourcemap-negative-test' : 'verify',
  commands: [],
  vitest: null,
  build: null,
  dist: null,
  sourcemaps: null,
  staticServer: null,
  conclusion: 'PENDING'
};

const rawLog = createWriteStream(rawLogPath, { flags: 'w' });

function log(line = '') {
  console.log(line);
  rawLog.write(`${line}\n`);
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function checkNoSourceMaps(root) {
  const maps = listFiles(join(root, 'assets')).filter((path) => path.endsWith('.map'));
  return {
    root,
    passed: maps.length === 0,
    maps: maps.map((path) => relative(root, path).replaceAll('\\', '/'))
  };
}

function computeDistHash(root) {
  const files = listFiles(root);
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    const relativePath = relative(root, file).replaceAll('\\', '/');
    const content = readFileSync(file);
    const stats = statSync(file);
    totalBytes += stats.size;
    hash.update(relativePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return {
    algorithm: 'sha256',
    hash: hash.digest('hex'),
    fileCount: files.length,
    totalBytes,
    files: files.map((file) => ({ path: relative(root, file).replaceAll('\\', '/'), bytes: statSync(file).size }))
  };
}

function parseVitest(output) {
  const testsLine = [...output.matchAll(/Tests\s+([0-9]+)\s+passed(?:\s*\|\s*([0-9]+)\s+skipped)?(?:\s*\(([0-9]+)\))?/g)].at(-1);
  const filesLine = [...output.matchAll(/Test Files\s+([0-9]+)\s+passed(?:\s*\|\s*([0-9]+)\s+skipped)?(?:\s*\(([0-9]+)\))?/g)].at(-1);
  if (!testsLine && !filesLine) {
    return { parsed: false, rawSummary: output.split('\n').slice(-30).join('\n') };
  }
  const testsPassed = testsLine ? Number(testsLine[1]) : null;
  const testsSkipped = testsLine?.[2] ? Number(testsLine[2]) : 0;
  const testsTotal = testsLine?.[3] ? Number(testsLine[3]) : testsPassed === null ? null : testsPassed + testsSkipped;
  return {
    parsed: true,
    testsPassed,
    testsSkipped,
    testsTotal,
    filesPassed: filesLine ? Number(filesLine[1]) : null,
    filesSkipped: filesLine?.[2] ? Number(filesLine[2]) : 0,
    rawSummary: output.split('\n').filter((line) => /Test Files|Tests|Duration/.test(line)).join('\n')
  };
}

function parseBuild(output, startedAt, finishedAt) {
  const builtLine = [...output.matchAll(/built in\s+([^\n]+)/g)].at(-1);
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    viteBuiltIn: builtLine?.[1]?.trim() ?? null
  };
}

function runCommand(id, command, args, options = {}) {
  return new Promise((resolve) => {
    const logPath = join(commandLogDir, `${id}.log`);
    const commandLine = [command, ...args].join(' ');
    const startedAt = new Date();
    let output = '';
    log(`\n$ ${commandLine}`);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false
    });
    const stream = createWriteStream(logPath, { flags: 'w' });
    stream.write(`$ ${commandLine}\n`);

    const write = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      rawLog.write(text);
      stream.write(text);
    };

    child.stdout.on('data', write);
    child.stderr.on('data', write);
    child.on('close', (exitCode) => {
      const finishedAt = new Date();
      const record = {
        id,
        command: commandLine,
        exitCode,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        logPath
      };
      summary.commands.push(record);
      stream.end(`\nexitCode=${exitCode}\n`);
      log(`exitCode=${exitCode}`);
      resolve({ ...record, output, startedAt, finishedAt });
    });
  });
}

async function getAvailablePort() {
  const server = createServer();
  return await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Unable to allocate a port'));
        }
      });
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status === 200) return;
    } catch {
      // Retry until the server is ready or the bounded wait expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function startStaticServerForChecks() {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['server/static-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer(baseUrl);
    const response = await fetch(baseUrl, { method: 'HEAD', headers: { 'Accept-Encoding': 'br,gzip' } });
    const headers = Object.fromEntries(response.headers.entries());
    const required = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };
    const missingOrWrong = Object.entries(required).filter(([name, value]) => headers[name] !== value);
    const csp = headers['content-security-policy'] ?? '';
    const passed = response.status === 200 && missingOrWrong.length === 0 && csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'");
    summary.staticServer = { baseUrl, exitCode: passed ? 0 : 1, status: response.status, headers, missingOrWrong, output };
    log(`static-header-check exitCode=${passed ? 0 : 1} url=${baseUrl}`);
    return { passed, baseUrl, child };
  } catch (error) {
    child.kill();
    summary.staticServer = { baseUrl, exitCode: 1, error: error instanceof Error ? error.message : String(error), output };
    log(`static-header-check exitCode=1 url=${baseUrl}`);
    return { passed: false, baseUrl, child: null };
  }
}

function writeSummary(finalExitCode) {
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = new Date(summary.finishedAt).getTime() - startTime.getTime();
  summary.conclusion = finalExitCode === 0 ? 'PASS' : 'FAIL';
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

  const commandRows = summary.commands.map((command) => `| ${command.id} | ${command.exitCode} | ${command.durationMs} | ${command.logPath} |`).join('\n');
  const markdown = `# Task 14 Verification Summary\n\n` +
    `Conclusion: ${summary.conclusion}\n\n` +
    `Mode: ${summary.mode}\n\n` +
    `Started: ${summary.startedAt}\n\n` +
    `Finished: ${summary.finishedAt}\n\n` +
    `Duration ms: ${summary.durationMs}\n\n` +
    `## Commands\n\n| id | exit code | duration ms | log |\n|---|---:|---:|---|\n${commandRows}\n\n` +
    `## Vitest\n\n${summary.vitest ? JSON.stringify(summary.vitest, null, 2) : 'not run'}\n\n` +
    `## Build\n\n${summary.build ? JSON.stringify(summary.build, null, 2) : 'not run'}\n\n` +
    `## Dist Hash\n\n${summary.dist ? `${summary.dist.algorithm}:${summary.dist.hash}\nfiles: ${summary.dist.fileCount}\nbytes: ${summary.dist.totalBytes}` : 'not collected'}\n\n` +
    `## Sourcemaps\n\n${summary.sourcemaps ? JSON.stringify(summary.sourcemaps, null, 2) : 'not checked'}\n\n` +
    `## Static Server\n\n${summary.staticServer ? JSON.stringify(summary.staticServer, null, 2) : 'not checked'}\n`;
  writeFileSync(markdownPath, markdown, 'utf-8');
  log(`\nwrote ${summaryPath}`);
  log(`wrote ${markdownPath}`);
}

async function runSourcemapNegativeMode() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ying-zhong-jiu-sourcemap-negative-'));
  mkdirSync(join(tempRoot, 'assets'), { recursive: true });
  writeFileSync(join(tempRoot, 'assets', 'simulated-regression.map'), '{}\n', 'utf-8');
  summary.sourcemaps = checkNoSourceMaps(tempRoot);
  summary.dist = computeDistHash(tempRoot);
  const finalExitCode = summary.sourcemaps.passed ? 0 : 1;
  writeSummary(finalExitCode);
  rmSync(tempRoot, { recursive: true, force: true });
  rawLog.end();
  process.exitCode = finalExitCode;
}

async function main() {
  if (sourcemapNegativeMode) {
    await runSourcemapNegativeMode();
    return;
  }

  let failed = false;
  const typecheck = await runCommand('typecheck', 'npm', ['run', 'typecheck']);
  failed ||= typecheck.exitCode !== 0;

  const vitest = await runCommand('vitest', 'npm', ['run', 'test:run']);
  summary.vitest = parseVitest(vitest.output);
  failed ||= vitest.exitCode !== 0;

  const build = await runCommand('build', 'npm', ['run', 'build']);
  summary.build = parseBuild(build.output, build.startedAt, build.finishedAt);
  failed ||= build.exitCode !== 0;

  if (build.exitCode === 0 && existsSync('dist')) {
    summary.sourcemaps = checkNoSourceMaps('dist');
    summary.dist = computeDistHash('dist');
    failed ||= !summary.sourcemaps.passed;

    const staticCheck = await startStaticServerForChecks();
    failed ||= !staticCheck.passed;

    if (staticCheck.passed) {
      try {
        const prodE2e = await runCommand('e2e-production-url', 'npx', [
          'playwright', 'test', 'tests/e2e/production-url.spec.ts', '--project=production-chromium', '--workers=1'
        ], { env: { E2E_PRODUCTION_URL: staticCheck.baseUrl } });
        failed ||= prodE2e.exitCode !== 0;
      } finally {
        staticCheck.child?.kill();
      }
    } else {
      summary.commands.push({
        id: 'e2e-production-url',
        command: 'npx playwright test tests/e2e/production-url.spec.ts --project=production-chromium',
        exitCode: null,
        skipped: 'static header check failed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        logPath: null
      });
    }
  } else {
    summary.sourcemaps = { root: 'dist', passed: false, maps: [], error: 'dist missing because build failed or did not produce output' };
    failed = true;
  }

  const mobileInput = await runCommand('e2e-mobile-input', 'npx', [
    'playwright', 'test', 'tests/e2e/input-mobile.spec.ts', '--project=mobile-landscape-chromium', '--workers=1'
  ], { env: { E2E_PRODUCTION_URL: '' } });
  failed ||= mobileInput.exitCode !== 0;

  const dialogue = await runCommand('e2e-dialogue-advance', 'npx', [
    'playwright', 'test', 'tests/e2e/dialogue-advance-regression.spec.ts', '--project=desktop-chromium', '--project=mobile-landscape-chromium', '--workers=1'
  ], { env: { E2E_PRODUCTION_URL: '' } });
  failed ||= dialogue.exitCode !== 0;

  const finalExitCode = failed ? 1 : 0;
  writeSummary(finalExitCode);
  rawLog.end();
  process.exitCode = finalExitCode;
}

main().catch((error) => {
  summary.unhandledError = error instanceof Error ? error.stack ?? error.message : String(error);
  writeSummary(1);
  rawLog.end();
  console.error(error);
  process.exitCode = 1;
});
