/**
 * GraphQL gateway — a focused, dependency-free query executor.
 *
 * Real enough to be honest: it tokenizes and parses a GraphQL query (operation,
 * fields, arguments, aliases, variables, nested selection sets), validates it
 * against the schema (unknown field/query, missing required argument,
 * selection-on-scalar, missing-selection-on-object), executes each top-level
 * query against the resolver map, and projects the selection set recursively
 * onto the result — exactly like GraphQL field selection. It returns the
 * canonical `{ data, errors }` shape plus the summed credit cost.
 *
 * Deterministic (the resolvers are), no external dependency, no Math.random.
 * Mutations, fragments, directives, and unions are out of scope — a query that
 * uses them gets a clear error rather than a wrong answer.
 */

import { QUERIES, TYPES, isScalarType } from '@/lib/graphql/schema';
import { RESOLVERS } from '@/lib/graphql/resolvers';

export interface GqlError {
  message: string;
  path?: (string | number)[];
}

export interface GqlExecutionResult {
  data: Record<string, unknown> | null;
  errors: GqlError[];
  /** Total credits the executed top-level queries cost. */
  cost: number;
}

interface Selection {
  alias?: string;
  name: string;
  args: Record<string, string>;
  selections: Selection[];
}

interface ParsedOperation {
  operationName: string | null;
  selections: Selection[];
}

/** Thrown for syntax/validation problems that abort parsing (vs. per-field errors). */
export class GraphQLParseError extends Error {}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'name'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: string }
  | { kind: 'punct'; value: string };

const PUNCT = new Set(['{', '}', '(', ')', ':', '!', '[', ']', ',', '$', '=']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '#') { // comment to end of line
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c) || c === ',') { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let val = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) { val += src[j + 1]; j += 2; continue; }
        val += src[j];
        j++;
      }
      if (j >= n) throw new GraphQLParseError('Unterminated string literal.');
      tokens.push({ kind: 'string', value: val });
      i = j + 1;
      continue;
    }
    if (PUNCT.has(c)) { tokens.push({ kind: 'punct', value: c }); i++; continue; }
    if (/[-0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.\-eE+]/.test(src[j])) j++;
      tokens.push({ kind: 'int', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[_A-Za-z]/.test(c)) {
      let j = i;
      while (j < n && /[_0-9A-Za-z]/.test(src[j])) j++;
      tokens.push({ kind: 'name', value: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new GraphQLParseError(`Unexpected character "${c}".`);
  }
  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parse(src: string, variables: Record<string, unknown>): ParsedOperation {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const t = tokens[pos++];
    if (!t) throw new GraphQLParseError('Unexpected end of query.');
    return t;
  };
  const expectPunct = (v: string) => {
    const t = next();
    if (t.kind !== 'punct' || t.value !== v) throw new GraphQLParseError(`Expected "${v}".`);
  };

  let operationName: string | null = null;

  // Optional operation keyword + name + variable definitions.
  const first = peek();
  if (first && first.kind === 'name' && (first.value === 'query' || first.value === 'mutation' || first.value === 'subscription')) {
    if (first.value !== 'query') throw new GraphQLParseError(`Only "query" operations are supported (got "${first.value}").`);
    next();
    const maybeName = peek();
    if (maybeName && maybeName.kind === 'name') { operationName = maybeName.value; next(); }
    // Skip a variable-definition block: ( $x: Type, ... )
    if (peek()?.kind === 'punct' && peek()?.value === '(') {
      let depth = 0;
      do {
        const t = next();
        if (t.kind === 'punct' && t.value === '(') depth++;
        else if (t.kind === 'punct' && t.value === ')') depth--;
      } while (depth > 0);
    }
  }

  const selections = parseSelectionSet();
  return { operationName, selections };

  function parseSelectionSet(): Selection[] {
    expectPunct('{');
    const sels: Selection[] = [];
    while (!(peek()?.kind === 'punct' && peek()?.value === '}')) {
      if (!peek()) throw new GraphQLParseError('Unterminated selection set.');
      sels.push(parseField());
    }
    expectPunct('}');
    if (sels.length === 0) throw new GraphQLParseError('A selection set must select at least one field.');
    return sels;
  }

  function parseField(): Selection {
    const nameTok = next();
    if (nameTok.kind !== 'name') throw new GraphQLParseError('Expected a field name.');
    let alias: string | undefined;
    let name = nameTok.value;
    // alias: `alias: field`
    if (peek()?.kind === 'punct' && peek()?.value === ':') {
      next();
      const realName = next();
      if (realName.kind !== 'name') throw new GraphQLParseError('Expected a field name after alias.');
      alias = name;
      name = realName.value;
    }
    const args = peek()?.kind === 'punct' && peek()?.value === '(' ? parseArgs() : {};
    const selections = peek()?.kind === 'punct' && peek()?.value === '{' ? parseSelectionSet() : [];
    return { alias, name, args, selections };
  }

  function parseArgs(): Record<string, string> {
    expectPunct('(');
    const args: Record<string, string> = {};
    while (!(peek()?.kind === 'punct' && peek()?.value === ')')) {
      const argName = next();
      if (argName.kind !== 'name') throw new GraphQLParseError('Expected an argument name.');
      expectPunct(':');
      const valTok = next();
      if (valTok.kind === 'punct' && valTok.value === '$') {
        const varName = next();
        if (varName.kind !== 'name') throw new GraphQLParseError('Expected a variable name after "$".');
        const v = variables[varName.value];
        if (v === undefined) throw new GraphQLParseError(`Variable "$${varName.value}" was not provided.`);
        args[argName.value] = String(v);
      } else if (valTok.kind === 'string' || valTok.kind === 'int' || valTok.kind === 'name') {
        args[argName.value] = valTok.value;
      } else {
        throw new GraphQLParseError(`Invalid value for argument "${argName.value}".`);
      }
    }
    expectPunct(')');
    return args;
  }
}

// ─── Execution + projection ───────────────────────────────────────────────────

function project(
  value: unknown,
  selections: Selection[],
  typeName: string,
  path: (string | number)[],
  errors: GqlError[],
): unknown {
  if (value === null || value === undefined) return null;
  const type = TYPES[typeName];
  if (!type) { errors.push({ message: `Unknown type "${typeName}".`, path }); return null; }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const sel of selections) {
    const key = sel.alias ?? sel.name;
    const field = type.fields.find((f) => f.name === sel.name);
    if (!field) {
      errors.push({ message: `Cannot query field "${sel.name}" on type "${typeName}".`, path });
      continue;
    }
    const raw = source[field.name];
    const fieldPath = [...path, key];

    if (isScalarType(field.type)) {
      if (sel.selections.length > 0) {
        errors.push({ message: `Field "${sel.name}" is a scalar and cannot have a selection of subfields.`, path: fieldPath });
        continue;
      }
      out[key] = raw === undefined ? null : raw;
      continue;
    }

    // Object type — a selection set is required.
    if (sel.selections.length === 0) {
      errors.push({ message: `Field "${sel.name}" of type "${field.type}" must have a selection of subfields.`, path: fieldPath });
      continue;
    }
    if (field.list) {
      out[key] = Array.isArray(raw)
        ? raw.map((item, idx) => project(item, sel.selections, field.type, [...fieldPath, idx], errors))
        : null;
    } else {
      out[key] = project(raw, sel.selections, field.type, fieldPath, errors);
    }
  }
  return out;
}

/** Parse, validate, and execute a GraphQL query against the enrichment schema. */
export function execute(query: string, variables: Record<string, unknown> = {}): GqlExecutionResult {
  const errors: GqlError[] = [];
  let op: ParsedOperation;
  try {
    op = parse(query, variables);
  } catch (e) {
    return { data: null, errors: [{ message: e instanceof Error ? e.message : 'Invalid query.' }], cost: 0 };
  }

  const data: Record<string, unknown> = {};
  let cost = 0;

  for (const sel of op.selections) {
    const key = sel.alias ?? sel.name;
    const q = QUERIES[sel.name];
    if (!q) {
      errors.push({ message: `Cannot query field "${sel.name}" on type "Query".`, path: [key] });
      data[key] = null;
      continue;
    }
    // Required-argument validation.
    const missing = q.args.find((a) => a.required && (sel.args[a.name] === undefined || sel.args[a.name] === ''));
    if (missing) {
      errors.push({ message: `Field "${sel.name}" is missing required argument "${missing.name}".`, path: [key] });
      data[key] = null;
      continue;
    }
    // Top-level queries return object types — a selection set is required.
    if (sel.selections.length === 0) {
      errors.push({ message: `Field "${sel.name}" of type "${q.returnType}" must have a selection of subfields.`, path: [key] });
      data[key] = null;
      continue;
    }

    cost += q.creditCost;
    const resolver = RESOLVERS[q.resolverKey];
    let result: object | null = null;
    try {
      result = resolver(sel.args);
    } catch (e) {
      errors.push({ message: e instanceof Error ? e.message : `Resolver for "${sel.name}" failed.`, path: [key] });
      data[key] = null;
      continue;
    }
    data[key] = project(result, sel.selections, q.returnType, [key], errors);
  }

  return { data, errors, cost };
}

/** Estimate a query's credit cost without executing it (e.g. to preview cost before a run). */
export function estimateCost(query: string): number {
  try {
    const op = parse(query, {});
    return op.selections.reduce((sum, sel) => sum + (QUERIES[sel.name]?.creditCost ?? 0), 0);
  } catch {
    return 0;
  }
}
