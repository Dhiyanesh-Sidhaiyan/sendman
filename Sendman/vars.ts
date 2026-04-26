export type VarMap = Record<string, string>;

export function mergeVars(...sources: VarMap[]): VarMap {
  return Object.assign({}, ...sources);
}

const VAR_RE = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;
const QUOTED_VAR_RE = /"\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}"/g;

export function substitute(input: string, vars: VarMap): string {
  if (!input) return input;
  return input.replace(VAR_RE, (_m, name: string) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{{${name}}}`;
  });
}

// JSON-typed substitution: "{{var}}" -> raw token when value is number/bool/null.
// String values keep their quotes. Bare {{var}} (no surrounding quotes) gets normal string substitution.
export function substituteJson(input: string, vars: VarMap): string {
  if (!input) return input;
  const withTyped = input.replace(QUOTED_VAR_RE, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return match;
    const raw = vars[name];
    if (isJsonScalar(raw)) return raw;
    return JSON.stringify(raw);
  });
  return withTyped.replace(VAR_RE, (_m, name: string) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{{${name}}}`;
  });
}

function isJsonScalar(s: string): boolean {
  if (s === 'true' || s === 'false' || s === 'null') return true;
  if (s === '' || /\s/.test(s)) return false;
  return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s);
}
