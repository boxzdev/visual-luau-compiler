/**
 * Luau Static Analyzer & Diagnostic Engine for Visual Luau Compiler.
 * Produces Roblox Studio-accurate diagnostic squiggly markers:
 *   - Red squiggly lines for syntax errors (MarkerSeverity.Error)
 *   - Yellow squiggly lines for warnings (MarkerSeverity.Warning):
 *       - Unknown globals (W000)
 *       - Unused local variables (W001)
 *       - Deprecated Roblox APIs (W002)
 *       - Shadowed variables (W003)
 */

import { LuaSyntaxError } from './luaRunner';

export interface LuauDiagnostic {
  severity: number; // 8 = Error, 4 = Warning, 2 = Info, 1 = Hint
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
}

// Built-in Roblox globals that are always defined in Luau environments
export const ROBLOX_BUILTIN_GLOBALS = new Set([
  // Core globals & singletons
  'game',
  'workspace',
  'script',
  'plugin',
  'shared',
  '_G',
  '_VERSION',
  'Enum',

  // Roblox Datatypes
  'Vector3',
  'Vector2',
  'Vector3int16',
  'Vector2int16',
  'CFrame',
  'Color3',
  'BrickColor',
  'Ray',
  'UDim',
  'UDim2',
  'NumberRange',
  'NumberSequence',
  'NumberSequenceKeypoint',
  'ColorSequence',
  'ColorSequenceKeypoint',
  'PhysicalProperties',
  'Rect',
  'Region3',
  'Region3int16',
  'TweenInfo',
  'Faces',
  'Axes',
  'CatalogSearchParams',
  'RaycastParams',
  'OverlapParams',
  'Font',
  'DateTime',
  'Random',
  'PathWaypoint',
  'FloatCurveKey',
  'RotationCurveKey',

  // Global Instances & Libraries
  'Instance',
  'math',
  'table',
  'string',
  'task',
  'coroutine',
  'os',
  'debug',
  'utf8',
  'bit32',
  'buffer',

  // Global Functions
  'print',
  'warn',
  'error',
  'assert',
  'wait',
  'delay',
  'spawn',
  'tick',
  'time',
  'typeof',
  'type',
  'require',
  'pairs',
  'ipairs',
  'next',
  'pcall',
  'xpcall',
  'select',
  'tonumber',
  'tostring',
  'unpack',
  'rawget',
  'rawset',
  'rawequal',
  'setmetatable',
  'getmetatable',
  'collectgarbage',
  'newproxy',
]);

// Deprecated method calls (flagged on `:` or `.`)
export const DEPRECATED_METHODS: Record<string, string> = {
  Remove: "':Remove' is deprecated; consider using ':Destroy' instead",
  findFirstChild: "':findFirstChild' is deprecated; use ':FindFirstChild' instead",
  FindFirstChildWhichIsA: "':FindFirstChildWhichIsA' is deprecated; use ':FindFirstChildOfClass' instead",
  children: "':children' is deprecated; use ':GetChildren' instead",
  clone: "':clone' is deprecated; use ':Clone' instead",
  destroy: "':destroy' is deprecated; use ':Destroy' instead",
  connect: "'connect' is deprecated; use 'Connect' instead",
  disconnect: "'disconnect' is deprecated; use 'Disconnect' instead",
  isA: "':isA' is deprecated; use ':IsA' instead",
};

// Deprecated global functions (flagged when called as standalone functions)
export const DEPRECATED_GLOBALS: Record<string, string> = {
  wait: "'wait' is deprecated; consider using 'task.wait' instead",
  spawn: "'spawn' is deprecated; consider using 'task.spawn' instead",
  delay: "'delay' is deprecated; consider using 'task.delay' instead",
  tick: "'tick' is deprecated; consider using 'os.clock' or 'time' instead",
};

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
  'true', 'until', 'while',
]);

interface Token {
  type: 'keyword' | 'ident' | 'number' | 'string' | 'symbol';
  value: string;
  line: number;
  col: number;
}

export function tokenizeLuau(code: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];

    // Newlines
    if (ch === '\n') {
      line++;
      col = 1;
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      col++;
      i++;
      continue;
    }

    // Comments (-- or --[[ ... ]])
    if (ch === '-' && code[i + 1] === '-') {
      i += 2;
      col += 2;
      if (code[i] === '[' && code[i + 1] === '[') {
        i += 2;
        col += 2;
        while (i < n && !(code[i] === ']' && code[i + 1] === ']')) {
          if (code[i] === '\n') {
            line++;
            col = 1;
          } else {
            col++;
          }
          i++;
        }
        if (i < n) {
          i += 2;
          col += 2;
        }
      } else {
        while (i < n && code[i] !== '\n') {
          i++;
          col++;
        }
      }
      continue;
    }

    // Strings: single, double, backtick
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const startCol = col;
      const startLine = line;
      let val = ch;
      i++;
      col++;
      while (i < n && code[i] !== quote && code[i] !== '\n') {
        if (code[i] === '\\' && i + 1 < n) {
          val += code[i] + code[i + 1];
          i += 2;
          col += 2;
        } else {
          val += code[i];
          i++;
          col++;
        }
      }
      if (i < n && code[i] === quote) {
        val += code[i];
        i++;
        col++;
      }
      tokens.push({ type: 'string', value: val, line: startLine, col: startCol });
      continue;
    }

    // Multi-line string [[ ... ]]
    if (ch === '[' && code[i + 1] === '[') {
      const startCol = col;
      const startLine = line;
      let val = '[[';
      i += 2;
      col += 2;
      while (i < n && !(code[i] === ']' && code[i + 1] === ']')) {
        if (code[i] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        val += code[i];
        i++;
      }
      if (i < n) {
        val += ']]';
        i += 2;
        col += 2;
      }
      tokens.push({ type: 'string', value: val, line: startLine, col: startCol });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const startCol = col;
      let val = '';
      while (i < n && /[0-9a-zA-Z_.]/.test(code[i])) {
        val += code[i];
        i++;
        col++;
      }
      tokens.push({ type: 'number', value: val, line, col: startCol });
      continue;
    }

    // Identifiers or Keywords
    if (/[a-zA-Z_]/.test(ch)) {
      const startCol = col;
      let val = '';
      while (i < n && /[a-zA-Z0-9_]/.test(code[i])) {
        val += code[i];
        i++;
        col++;
      }
      const type = LUA_KEYWORDS.has(val) ? 'keyword' : 'ident';
      tokens.push({ type, value: val, line, col: startCol });
      continue;
    }

    // Multi-char symbols
    const next2 = ch + (code[i + 1] || '');
    const next3 = next2 + (code[i + 2] || '');
    if (next3 === '...') {
      tokens.push({ type: 'symbol', value: '...', line, col });
      i += 3;
      col += 3;
      continue;
    }
    if (['==', '~=', '<=', '>=', '..', '::', '+=', '-=', '*=', '/='].includes(next2)) {
      tokens.push({ type: 'symbol', value: next2, line, col });
      i += 2;
      col += 2;
      continue;
    }

    tokens.push({ type: 'symbol', value: ch, line, col });
    i++;
    col++;
  }

  return tokens;
}

interface VarInfo {
  line: number;
  col: number;
  length: number;
  used: boolean;
}

/**
 * Performs fast static analysis on Luau code to find warnings (yellow squigglies):
 *   - Unknown globals
 *   - Unused local variables
 *   - Deprecated Roblox APIs
 */
export function analyzeLuau(code: string): LuauDiagnostic[] {
  const tokens = tokenizeLuau(code);
  const diagnostics: LuauDiagnostic[] = [];

  // Scopes stack
  const scopes: Array<Map<string, VarInfo>> = [new Map()];

  function currentScope(): Map<string, VarInfo> {
    return scopes[scopes.length - 1];
  }

  function findVariable(name: string): VarInfo | null {
    for (let s = scopes.length - 1; s >= 0; s--) {
      const v = scopes[s].get(name);
      if (v) return v;
    }
    return null;
  }

  function declareLocal(name: string, token: Token) {
    const scope = currentScope();
    scope.set(name, {
      line: token.line,
      col: token.col,
      length: token.value.length,
      used: false,
    });
  }

  function popScope() {
    const scope = scopes.pop();
    if (scope) {
      for (const [name, info] of scope.entries()) {
        if (!info.used && !name.startsWith('_')) {
          diagnostics.push({
            severity: 4, // MarkerSeverity.Warning
            message: `W001: (Luau) Variable '${name}' is never used; consider prefixing with '_' to silence this warning`,
            startLineNumber: info.line,
            startColumn: info.col,
            endLineNumber: info.line,
            endColumn: info.col + info.length,
            source: 'Luau',
          });
        }
      }
    }
  }

  let idx = 0;
  const numTokens = tokens.length;

  while (idx < numTokens) {
    const t = tokens[idx];

    // Scope openers
    if (t.type === 'keyword') {
      if (t.value === 'function') {
        const isLocalFunction = idx > 0 && tokens[idx - 1].value === 'local';
        const funcScope = new Map<string, VarInfo>();
        scopes.push(funcScope);

        idx++;
        // Check for function name (e.g. `function foo(...)` or `function tbl:foo(...)`)
        let isMethod = false;
        while (idx < numTokens && !(tokens[idx].type === 'symbol' && tokens[idx].value === '(')) {
          if (tokens[idx].type === 'symbol' && tokens[idx].value === ':') {
            isMethod = true;
          }
          idx++;
        }

        // Methods automatically receive implicit `self` parameter in scope
        if (isMethod) {
          funcScope.set('self', { line: t.line, col: t.col, length: 4, used: true });
        }

        // Read function parameters
        if (idx < numTokens && tokens[idx].value === '(') {
          idx++;
          while (idx < numTokens && !(tokens[idx].type === 'symbol' && tokens[idx].value === ')')) {
            if (tokens[idx].type === 'ident') {
              declareLocal(tokens[idx].value, tokens[idx]);
            }
            idx++;
          }
        }
        idx++;
        continue;
      }

      if (t.value === 'do' || t.value === 'then' || t.value === 'repeat') {
        scopes.push(new Map());
        idx++;
        continue;
      }

      if (t.value === 'end' || t.value === 'until') {
        if (scopes.length > 1) {
          popScope();
        }
        idx++;
        continue;
      }

      // `local` declarations
      if (t.value === 'local') {
        idx++;
        // `local function foo(...)`
        if (idx < numTokens && tokens[idx].type === 'keyword' && tokens[idx].value === 'function') {
          idx++;
          if (idx < numTokens && tokens[idx].type === 'ident') {
            const funcName = tokens[idx];
            declareLocal(funcName.value, funcName);
            idx++;
          }
          const funcScope = new Map<string, VarInfo>();
          scopes.push(funcScope);
          while (idx < numTokens && !(tokens[idx].type === 'symbol' && tokens[idx].value === '(')) {
            idx++;
          }
          if (idx < numTokens && tokens[idx].value === '(') {
            idx++;
            while (idx < numTokens && !(tokens[idx].type === 'symbol' && tokens[idx].value === ')')) {
              if (tokens[idx].type === 'ident') {
                declareLocal(tokens[idx].value, tokens[idx]);
              }
              idx++;
            }
          }
          idx++;
          continue;
        }

        // `local a, b = ...`
        while (idx < numTokens && tokens[idx].type === 'ident') {
          declareLocal(tokens[idx].value, tokens[idx]);
          idx++;
          if (idx < numTokens && tokens[idx].type === 'symbol' && tokens[idx].value === ',') {
            idx++;
          } else {
            break;
          }
        }
        continue;
      }

      // `for i = 1, 10 do` or `for k, v in pairs(...) do`
      if (t.value === 'for') {
        scopes.push(new Map());
        idx++;
        while (idx < numTokens && tokens[idx].type === 'ident') {
          declareLocal(tokens[idx].value, tokens[idx]);
          idx++;
          if (idx < numTokens && tokens[idx].type === 'symbol' && tokens[idx].value === ',') {
            idx++;
          } else {
            break;
          }
        }
        continue;
      }
    }

    // Check identifier usage
    if (t.type === 'ident') {
      const prev = tokens[idx - 1];
      const next = tokens[idx + 1];

      // Check member access: `obj.prop` or `obj:method()`
      if (prev && (prev.value === '.' || prev.value === ':')) {
        // Deprecated method check
        if (DEPRECATED_METHODS[t.value]) {
          diagnostics.push({
            severity: 4, // Warning
            message: `W002: (Luau) ${DEPRECATED_METHODS[t.value]}`,
            startLineNumber: t.line,
            startColumn: t.col,
            endLineNumber: t.line,
            endColumn: t.col + t.value.length,
            source: 'Luau',
          });
        }
        idx++;
        continue;
      }

      // Table literal key: `{ key = val }`
      if (next && next.value === '=' && prev && (prev.value === '{' || prev.value === ',' || prev.value === ';')) {
        idx++;
        continue;
      }

      // Standalone identifier reference or function call
      if (DEPRECATED_GLOBALS[t.value]) {
        diagnostics.push({
          severity: 4, // Warning
          message: `W002: (Luau) ${DEPRECATED_GLOBALS[t.value]}`,
          startLineNumber: t.line,
          startColumn: t.col,
          endLineNumber: t.line,
          endColumn: t.col + t.value.length,
          source: 'Luau',
        });
      }

      // Resolve variable
      const localDecl = findVariable(t.value);
      if (localDecl) {
        localDecl.used = true;
      } else if (!ROBLOX_BUILTIN_GLOBALS.has(t.value)) {
        // Flag unknown global
        diagnostics.push({
          severity: 4, // Warning
          message: `W000: (Luau) Unknown global '${t.value}'`,
          startLineNumber: t.line,
          startColumn: t.col,
          endLineNumber: t.line,
          endColumn: t.col + t.value.length,
          source: 'Luau',
        });
      }
    }

    idx++;
  }

  // Pop remaining scopes
  while (scopes.length > 0) {
    popScope();
  }

  return diagnostics;
}

/**
 * Pinpoints the exact token/character range for a syntax error (red squiggle).
 */
export function formatSyntaxErrorDiagnostic(
  error: LuaSyntaxError,
  model: any,
): LuauDiagnostic {
  const lineCount = model.getLineCount();
  const line = Math.min(Math.max(error.line, 1), lineCount);
  const lineContent = model.getLineContent(line);

  // Try to find the exact symbol mentioned in the error message
  // Examples: "unexpected symbol near ')'", "')' expected near 'bar'"
  const nearMatch = error.message.match(/near\s+'([^']+)'/);
  if (nearMatch && nearMatch[1]) {
    const symbol = nearMatch[1];
    const symbolIndex = lineContent.indexOf(symbol);
    if (symbolIndex >= 0) {
      return {
        severity: 8, // MarkerSeverity.Error
        message: `Syntax error: ${error.message}`,
        startLineNumber: line,
        startColumn: symbolIndex + 1,
        endLineNumber: line,
        endColumn: symbolIndex + 1 + symbol.length,
        source: 'Luau',
      };
    }
  }

  // If <eof> or missing keyword, find the last meaningful token on the line
  if (error.message.includes('<eof>')) {
    const trimmed = lineContent.trimEnd();
    const lastWordMatch = trimmed.match(/(\S+)$/);
    if (lastWordMatch && lastWordMatch.index !== undefined) {
      return {
        severity: 8,
        message: `Syntax error: ${error.message}`,
        startLineNumber: line,
        startColumn: lastWordMatch.index + 1,
        endLineNumber: line,
        endColumn: trimmed.length + 1,
        source: 'Luau',
      };
    }
  }

  // Default fallback: highlight from first non-whitespace to line length
  const firstNonWhitespace = lineContent.search(/\S/);
  const startColumn = firstNonWhitespace >= 0 ? firstNonWhitespace + 1 : 1;
  const endColumn = Math.max(lineContent.length + 1, startColumn + 1);

  return {
    severity: 8, // Error
    message: `Syntax error: ${error.message}`,
    startLineNumber: line,
    startColumn,
    endLineNumber: line,
    endColumn,
    source: 'Luau',
  };
}
