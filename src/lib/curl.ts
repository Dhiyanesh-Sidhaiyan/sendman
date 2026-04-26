import type { KV } from '../types';

export interface ParsedCurl {
  method: string;
  url: string;
  headers: KV[];
  body: { type: 'none' | 'json' | 'text' | 'form'; content: string };
  auth: { type: 'none' | 'basic'; username?: string; password?: string };
  warnings: string[];
}

export type CurlParseResult =
  | { ok: true; req: ParsedCurl }
  | { ok: false; error: string };

// Tokenize a shell-ish command. Honors single quotes (no escapes), double quotes
// (with \" \\ \n \t \r), ANSI-C $'...' (with \xNN, \n, \t, \r, \\, \', \"), and
// backslash-newline line continuations. Bare backslashes outside quotes escape
// the next character.
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inToken = false;
  let i = 0;
  const n = input.length;

  const push = () => {
    if (inToken) { tokens.push(cur); cur = ''; inToken = false; }
  };

  while (i < n) {
    const c = input[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      push();
      i++;
      continue;
    }

    // Backslash-newline line continuation.
    if (c === '\\' && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
      i += 2;
      if (input[i] === '\n' && input[i - 1] === '\r') i++;
      continue;
    }

    // ANSI-C $'...'
    if (c === '$' && input[i + 1] === "'") {
      inToken = true;
      i += 2;
      while (i < n && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < n) {
          const esc = input[i + 1];
          if (esc === 'n') { cur += '\n'; i += 2; continue; }
          if (esc === 't') { cur += '\t'; i += 2; continue; }
          if (esc === 'r') { cur += '\r'; i += 2; continue; }
          if (esc === '\\') { cur += '\\'; i += 2; continue; }
          if (esc === "'") { cur += "'"; i += 2; continue; }
          if (esc === '"') { cur += '"'; i += 2; continue; }
          if (esc === 'x') {
            const hex = input.slice(i + 2, i + 4);
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
              cur += String.fromCharCode(parseInt(hex, 16));
              i += 4;
              continue;
            }
          }
          cur += esc;
          i += 2;
          continue;
        }
        cur += input[i++];
      }
      if (input[i] === "'") i++;
      continue;
    }

    if (c === "'") {
      inToken = true;
      i++;
      while (i < n && input[i] !== "'") cur += input[i++];
      if (input[i] === "'") i++;
      continue;
    }

    if (c === '"') {
      inToken = true;
      i++;
      while (i < n && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < n) {
          const esc = input[i + 1];
          if (esc === '"' || esc === '\\' || esc === '$' || esc === '`') {
            cur += esc; i += 2; continue;
          }
          if (esc === 'n') { cur += '\n'; i += 2; continue; }
          if (esc === 't') { cur += '\t'; i += 2; continue; }
          if (esc === 'r') { cur += '\r'; i += 2; continue; }
          cur += '\\'; i++;
          continue;
        }
        cur += input[i++];
      }
      if (input[i] === '"') i++;
      continue;
    }

    if (c === '\\' && i + 1 < n) {
      inToken = true;
      cur += input[i + 1];
      i += 2;
      continue;
    }

    inToken = true;
    cur += c;
    i++;
  }
  push();
  return tokens;
}

// Flags that are no-ops or take a single argument we don't care about.
const NOOP_BOOL = new Set([
  '--compressed', '-k', '--insecure', '-L', '--location', '-s', '--silent',
  '-i', '--include', '-v', '--verbose', '-#', '--progress-bar',
  '-O', '--remote-name', '--no-keepalive', '--fail', '-f',
]);
const NOOP_VALUE = new Set([
  '-o', '--output', '-A', '--user-agent', '-e', '--referer',
  '--max-time', '--connect-timeout', '--retry', '--cacert', '--cert', '--key',
  '-w', '--write-out',
]);

function looksLikeFlag(t: string) { return t.startsWith('-'); }

function splitLong(t: string): [string, string | null] {
  const eq = t.indexOf('=');
  if (t.startsWith('--') && eq > 0) return [t.slice(0, eq), t.slice(eq + 1)];
  return [t, null];
}

export function parseCurl(input: string): CurlParseResult {
  let text = input.trim();
  if (text.startsWith('$ ')) text = text.slice(2).trim();
  if (!/^curl\b/i.test(text)) return { ok: false, error: 'Not a curl command' };
  text = text.replace(/^curl\b/i, '').trim();

  const tokens = tokenize(text);
  if (tokens.length === 0) return { ok: false, error: 'Empty curl command' };

  const headers: KV[] = [];
  const dataParts: string[] = [];
  let dataIsUrlEncoded = false;
  let url = '';
  let method = '';
  let auth: ParsedCurl['auth'] = { type: 'none' };
  let forceGet = false;
  const warnings: string[] = [];

  const consumeValue = (flag: string, given: string | null, idxRef: { i: number }) => {
    if (given !== null) return given;
    idxRef.i++;
    if (idxRef.i >= tokens.length) {
      warnings.push(`${flag} missing value`);
      return '';
    }
    return tokens[idxRef.i];
  };

  for (const idxRef = { i: 0 }; idxRef.i < tokens.length; idxRef.i++) {
    const raw = tokens[idxRef.i];
    if (!looksLikeFlag(raw)) {
      if (!url) url = raw;
      else warnings.push(`Ignored extra positional arg: ${raw}`);
      continue;
    }

    const [flag, attached] = splitLong(raw);

    switch (flag) {
      case '-X':
      case '--request':
        method = consumeValue(flag, attached, idxRef).toUpperCase();
        break;
      case '-H':
      case '--header': {
        const v = consumeValue(flag, attached, idxRef);
        const colon = v.indexOf(':');
        if (colon > 0) {
          const key = v.slice(0, colon).trim();
          const value = v.slice(colon + 1).trim();
          headers.push({ key, value, enabled: true });
        }
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        dataParts.push(consumeValue(flag, attached, idxRef));
        break;
      case '--data-urlencode': {
        const v = consumeValue(flag, attached, idxRef);
        const eq = v.indexOf('=');
        if (eq >= 0) {
          const k = v.slice(0, eq);
          const val = v.slice(eq + 1);
          dataParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
        } else {
          dataParts.push(encodeURIComponent(v));
        }
        dataIsUrlEncoded = true;
        break;
      }
      case '-u':
      case '--user': {
        const v = consumeValue(flag, attached, idxRef);
        const colon = v.indexOf(':');
        if (colon >= 0) {
          auth = { type: 'basic', username: v.slice(0, colon), password: v.slice(colon + 1) };
        } else {
          auth = { type: 'basic', username: v, password: '' };
        }
        break;
      }
      case '-G':
      case '--get':
        forceGet = true;
        break;
      case '--url':
        url = consumeValue(flag, attached, idxRef);
        break;
      case '-b':
      case '--cookie': {
        const v = consumeValue(flag, attached, idxRef);
        headers.push({ key: 'Cookie', value: v, enabled: true });
        break;
      }
      default:
        if (NOOP_BOOL.has(flag)) break;
        if (NOOP_VALUE.has(flag)) {
          if (attached === null) idxRef.i++;
          break;
        }
        warnings.push(`Unsupported flag: ${flag}`);
        // Heuristic: long flags that look like --foo=value already consumed.
        // For others we leave alone — likely safe.
        break;
    }
  }

  if (!url) return { ok: false, error: 'No URL found in curl command' };

  // Strip Authorization header if -u was used (curl would set it itself).
  let finalHeaders = headers;
  if (auth.type === 'basic') {
    finalHeaders = headers.filter(h => h.key.toLowerCase() !== 'authorization');
  }

  let bodyContent = dataParts.join(dataIsUrlEncoded ? '&' : '');

  if (forceGet) {
    method = 'GET';
    if (bodyContent) {
      const sep = url.includes('?') ? '&' : '?';
      url = url + sep + bodyContent;
      bodyContent = '';
    }
  }

  if (!method) method = bodyContent ? 'POST' : 'GET';

  // Body type inference.
  let bodyType: 'none' | 'json' | 'text' | 'form' = 'none';
  if (bodyContent) {
    const ct = finalHeaders.find(h => h.key.toLowerCase() === 'content-type')?.value ?? '';
    if (/application\/json/i.test(ct)) bodyType = 'json';
    else if (/application\/x-www-form-urlencoded/i.test(ct)) bodyType = 'form';
    else if (!ct) {
      try { JSON.parse(bodyContent); bodyType = 'json'; } catch { bodyType = 'text'; }
    } else {
      bodyType = 'text';
    }
  }

  return {
    ok: true,
    req: {
      method,
      url,
      headers: finalHeaders,
      body: { type: bodyType, content: bodyContent },
      auth,
      warnings,
    },
  };
}
