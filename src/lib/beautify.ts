export type BeautifyResult = { ok: true; text: string } | { ok: false; error: string };

export function beautifyJson(input: string): BeautifyResult {
  if (!input.trim()) return { ok: true, text: input };
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(input), null, 2) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Invalid JSON' };
  }
}

export function beautifyXml(input: string): BeautifyResult {
  if (!input.trim()) return { ok: true, text: input };
  try {
    // Tokenize: each token is either a tag, or text between tags.
    const trimmed = input.trim();
    const re = /<[^>]+>|[^<]+/g;
    const tokens = trimmed.match(re) ?? [];

    let depth = 0;
    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i].trim();
      if (!t) { i++; continue; }

      const isTag = t.startsWith('<');
      const isClosing = isTag && /^<\/[^>]+>/.test(t);
      const isSelfClose = isTag && /\/>$/.test(t);
      const isDecl = isTag && (/^<\?/.test(t) || /^<!/.test(t));
      const isOpening = isTag && !isClosing && !isSelfClose && !isDecl;

      // Check for <tag>text</tag> pattern: open + text + close on one line
      if (isOpening && i + 2 < tokens.length) {
        const text = tokens[i + 1];
        const close = tokens[i + 2].trim();
        if (text && !text.trim().startsWith('<') && /^<\/[^>]+>/.test(close)) {
          out.push('  '.repeat(depth) + t + text.trim() + close);
          i += 3;
          continue;
        }
      }

      if (isClosing) depth = Math.max(0, depth - 1);
      out.push('  '.repeat(depth) + t);
      if (isOpening) depth++;
      i++;
    }
    return { ok: true, text: out.join('\n') };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Invalid XML' };
  }
}
