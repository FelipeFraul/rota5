import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

let moduleSequence = 0;

export async function loadProductionModule(relativePath, mocks = {}, expose = [], transform = (source) => source) {
  const filePath = resolve(relativePath);
  const original = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, original, ts.ScriptTarget.Latest, true);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const importedNames = [];

  for (const statement of imports) {
    const clause = statement.importClause;
    if (!clause?.isTypeOnly) {
      if (clause?.name) importedNames.push(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) importedNames.push(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) importedNames.push(element.name.text);
        }
      }
    }
  }

  let executable = original;
  for (const statement of [...imports].sort((a, b) => b.getFullStart() - a.getFullStart())) {
    executable =
      executable.slice(0, statement.getFullStart()) +
      executable.slice(statement.getEnd());
  }
  executable = transform(executable);

  const key = `__rota5ProductionMocks${moduleSequence += 1}`;
  globalThis[key] = mocks;
  const prelude = importedNames.length
    ? `const { ${[...new Set(importedNames)].join(", ")} } = globalThis.${key};\n`
    : "";
  const extraExports = expose.length ? `\nexport { ${expose.join(", ")} };\n` : "";
  const transpiled = ts.transpileModule(prelude + executable + extraExports, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}#${moduleSequence}`
  );
}

function nestedValue(row, path) {
  if (path.includes("->>")) {
    const [column, key] = path.split("->>");
    return row?.[column]?.[key];
  }
  return path.split(".").reduce((value, key) => {
    const current = Array.isArray(value) ? value[0] : value;
    return current?.[key];
  }, row);
}

export class MemorySupabase {
  constructor(initialTables = {}, rpcHandlers = {}) {
    this.tables = Object.fromEntries(
      Object.entries(initialTables).map(([name, rows]) => [name, structuredClone(rows)]),
    );
    this.rpcHandlers = rpcHandlers;
    this.calls = [];
    this.sequence = 0;
  }

  from(table) {
    this.tables[table] ??= [];
    return new MemoryQuery(this, table);
  }

  async rpc(name, args) {
    this.calls.push({ table: "$rpc", operation: name, args: structuredClone(args) });
    const handler = this.rpcHandlers[name];
    return handler ? handler(args, this) : { data: null, error: null };
  }
}

class MemoryQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = "select";
    this.filters = [];
    this.orders = [];
    this.maxRows = null;
    this.payload = null;
  }

  select(columns) { this.columns = columns; return this; }
  returns() { return this; }
  eq(path, value) { this.filters.push((row) => nestedValue(row, path) === value); return this; }
  neq(path, value) { this.filters.push((row) => nestedValue(row, path) !== value); return this; }
  in(path, values) { this.filters.push((row) => values.includes(nestedValue(row, path))); return this; }
  is(path, value) { this.filters.push((row) => nestedValue(row, path) === value); return this; }
  not(path, operator, value) {
    if (operator === "is") this.filters.push((row) => nestedValue(row, path) !== value);
    return this;
  }
  lt(path, value) { this.filters.push((row) => nestedValue(row, path) < value); return this; }
  lte(path, value) { this.filters.push((row) => nestedValue(row, path) <= value); return this; }
  gt(path, value) { this.filters.push((row) => nestedValue(row, path) > value); return this; }
  gte(path, value) { this.filters.push((row) => nestedValue(row, path) >= value); return this; }
  ilike(path, pattern) {
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    const matcher = new RegExp(`^${escaped}$`, "i");
    this.filters.push((row) => matcher.test(String(nestedValue(row, path) ?? "")));
    return this;
  }
  contains(path, expected) {
    this.filters.push((row) => {
      const value = nestedValue(row, path);
      return value && Object.entries(expected).every(([key, item]) => value[key] === item);
    });
    return this;
  }
  or() { return this; }
  order(path, options = {}) { this.orders.push({ path, ascending: options.ascending !== false }); return this; }
  limit(value) { this.maxRows = value; return this; }
  range(from, to) { this.rangeValue = [from, to]; return this.execute(); }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  upsert(payload, options = {}) { this.operation = "upsert"; this.payload = payload; this.upsertOptions = options; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  single() { return this.execute("single"); }
  maybeSingle() { return this.execute("maybeSingle"); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }

  matches(row) { return this.filters.every((filter) => filter(row)); }

  async execute(mode) {
    const rows = this.db.tables[this.table];
    const matched = rows.filter((row) => this.matches(row));
    let data = null;

    if (this.operation === "select") {
      let selected = [...matched];
      for (const order of [...this.orders].reverse()) {
        selected.sort((left, right) => {
          const result = String(nestedValue(left, order.path) ?? "").localeCompare(
            String(nestedValue(right, order.path) ?? ""),
          );
          return order.ascending ? result : -result;
        });
      }
      if (this.rangeValue) selected = selected.slice(this.rangeValue[0], this.rangeValue[1] + 1);
      if (this.maxRows !== null) selected = selected.slice(0, this.maxRows);
      data = mode ? selected[0] ?? null : selected;
    } else if (this.operation === "insert") {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: row.id ?? `memory-${++this.db.sequence}`,
        created_at: row.created_at ?? new Date().toISOString(),
        ...structuredClone(row),
      }));
      rows.push(...inserted);
      data = mode ? inserted[0] : inserted;
    } else if (this.operation === "upsert") {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload];
      const conflict = String(this.upsertOptions?.onConflict ?? "id").split(",");
      for (const value of values) {
        const existing = rows.find((row) => conflict.every((key) => row[key] === value[key]));
        if (existing) Object.assign(existing, structuredClone(value));
        else rows.push(structuredClone(value));
      }
      data = mode ? values[0] : values;
    } else if (this.operation === "update") {
      for (const row of matched) Object.assign(row, structuredClone(this.payload));
      data = mode ? matched[0] ?? null : matched;
    } else if (this.operation === "delete") {
      const removed = [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (this.matches(rows[index])) removed.unshift(...rows.splice(index, 1));
      }
      data = mode ? removed[0] ?? null : removed;
    }

    this.db.calls.push({
      table: this.table,
      operation: this.operation,
      payload: structuredClone(this.payload),
      affected: Array.isArray(data) ? data.length : data ? 1 : 0,
    });
    return { data, error: null, count: Array.isArray(data) ? data.length : undefined };
  }
}
