import { escapeHtml } from "./format.js";

type Path = string[];
type Node = { kind: "text"; text: string } | { kind: "value"; path: Path } | { kind: "if"; path: Path; then: Node[]; else: Node[] };

function parsePath(expression: string): Path {
  const match = /^\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/.exec(expression);
  if (!match?.[1]) throw new Error(`Unsupported template action: {{ ${expression} }}`);
  return match[1].split(".");
}

/**
 * Parses the small subset of Go template syntax the Supabase auth templates use:
 * {{ .Field }}, {{ .Data.key }} and {{ if .Path }}...{{ else }}...{{ end }}. Anything else throws,
 * so a template that needs more than this is caught by the tests before it reaches Supabase.
 */
export function parseGoTemplate(source: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ node: Extract<Node, { kind: "if" }>; inElse: boolean }> = [];
  const target = () => {
    const top = stack.at(-1);
    return top ? (top.inElse ? top.node.else : top.node.then) : root;
  };
  let last = 0;
  for (const match of source.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (match.index > last) target().push({ kind: "text", text: source.slice(last, match.index) });
    last = match.index + match[0].length;
    const action = (match[1] ?? "").trim();
    if (action.startsWith("if ")) {
      const node: Extract<Node, { kind: "if" }> = { kind: "if", path: parsePath(action.slice(3).trim()), then: [], else: [] };
      target().push(node);
      stack.push({ node, inElse: false });
    } else if (action === "else") {
      const top = stack.at(-1);
      if (!top || top.inElse) throw new Error("Unexpected {{ else }}");
      top.inElse = true;
    } else if (action === "end") {
      if (!stack.pop()) throw new Error("Unexpected {{ end }}");
    } else {
      target().push({ kind: "value", path: parsePath(action) });
    }
  }
  if (stack.length > 0) throw new Error("Unclosed {{ if }}");
  if (last < source.length) root.push({ kind: "text", text: source.slice(last) });
  return root;
}

function lookup(data: unknown, path: Path): unknown {
  let value = data;
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function truthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function renderNodes(nodes: Node[], data: unknown): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return node.text;
      if (node.kind === "if") return renderNodes(truthy(lookup(data, node.path)) ? node.then : node.else, data);
      const value = lookup(data, node.path);
      // Go prints "<no value>" for a missing key; mirror it so unguarded fields show up in tests.
      return value === undefined || value === null ? escapeHtml("<no value>") : escapeHtml(String(value));
    })
    .join("");
}

/** Renders a template like Supabase would (values HTML-escaped), for previews and tests. */
export function renderGoTemplate(source: string, data: Record<string, unknown>) {
  return renderNodes(parseGoTemplate(source), data);
}
