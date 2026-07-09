/**
 * OUTLINE extraction for the script-editor explorer (Task 11, 2C part 1).
 *
 * Shipped implementation (documented decision): a regex over top-level (column-0) declarations —
 * function / class / const-let-var. The plan's preferred route, Monaco's TypeScript worker
 * (`monaco.languages.typescript.getTypeScriptWorker()` → `getNavigationTree`), is `any`-typed in
 * monaco 0.55, needs separate workers for javascript vs typescript models, and cannot run in
 * jsdom — the deterministic pure function is the accepted v1 fallback. Limitation: nested symbols
 * are not listed (top-level only).
 */

export type OutlineKind = "function" | "class" | "const";

export interface OutlineItem {
  kind: OutlineKind;
  name: string;
  /** 1-based line number, ready for editor.revealLineInCenter. */
  line: number;
  /** Display text: `name(params)` for functions, plain name otherwise. */
  signature: string;
}

const FUNCTION_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)?/;
const CLASS_RE = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const BINDING_RE = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(=?)\s*(.*)$/;

export function extractOutline(code: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i];
    // Top-level only: declarations at column 0. Indented lines are nested (or continuations).
    if (line.length === 0 || /^\s/.test(line)) {
      continue;
    }
    let match = FUNCTION_RE.exec(line);
    if (match) {
      const name = match[1];
      // If the parameter list closes on this line, show it verbatim; otherwise show an ellipsis.
      const closed = line.indexOf(")", line.indexOf("(")) !== -1;
      const signature = closed ? `${name}(${match[2].trim()})` : `${name}(…)`;
      items.push({ kind: "function", name, line: i + 1, signature });
      continue;
    }
    match = CLASS_RE.exec(line);
    if (match) {
      items.push({ kind: "class", name: match[1], line: i + 1, signature: match[1] });
      continue;
    }
    match = BINDING_RE.exec(line);
    if (match) {
      const name = match[1];
      // const-assigned functions read as functions in the outline (arrow or function expression).
      const initializer = match[3];
      const isFunction = match[2] === "=" && (/=>/.test(initializer) || /^(?:async\s+)?function\b/.test(initializer));
      items.push({ kind: isFunction ? "function" : "const", name, line: i + 1, signature: name });
    }
  }
  return items;
}
