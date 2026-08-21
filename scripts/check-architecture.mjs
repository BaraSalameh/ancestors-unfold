import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const sourceRoot = resolve("src");
const roots = ["app", "features", "routes", "server", "shared"].map((part) =>
  join(sourceRoot, part),
);
const sourceFiles = [];

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) visit(path);
    else if (/\.(ts|tsx)$/.test(entry) && entry !== "routeTree.gen.ts") sourceFiles.push(path);
  }
}
for (const root of roots) visit(root);

const forbiddenNames = /^(common|helpers|misc|utils)\.(ts|tsx)$/;
const failures = sourceFiles
  .filter((file) => forbiddenNames.test(file.split(/[\\/]/).at(-1) ?? ""))
  .map((file) => `Generic module name: ${relative(sourceRoot, file)}`);

const protectedInlineRules = [
  "max-lines",
  "max-lines-per-function",
  "complexity",
  "react-hooks/exhaustive-deps",
  "no-restricted-imports",
];
for (const file of sourceFiles) {
  const contents = readFileSync(file, "utf8");
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.includes("eslint-disable")) continue;
    const disablesAllRules = !line.includes("eslint-disable-") && !line.includes("--");
    if (disablesAllRules || protectedInlineRules.some((rule) => line.includes(rule)))
      failures.push(`Protected inline lint disable: ${relative(sourceRoot, file)}:${index + 1}`);
  }
}

function resolveModule(importer, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return undefined;
  const base = specifier.startsWith("@/")
    ? join(sourceRoot, specifier.slice(2))
    : resolve(dirname(importer), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ])
    if (existsSync(candidate) && [".ts", ".tsx"].includes(extname(candidate)))
      return normalize(candidate);
  return undefined;
}

const graph = new Map();
for (const file of sourceFiles) {
  const contents = readFileSync(file, "utf8");
  const runtimeContents = contents.replace(/\b(?:import|export)\s+type\s+[^;]+;/gs, "");
  const dependencies = new Set();
  for (const match of runtimeContents.matchAll(
    /\b(?:import|export)\s+([^;]+?)\s+from\s+["'`]([^"'`]+)["'`]/g,
  )) {
    const target = resolveModule(file, match[2]);
    if (target) dependencies.add(target);
  }
  for (const match of runtimeContents.matchAll(/import\s*\(["'`]([^"'`]+)["'`]\)/g)) {
    const target = resolveModule(file, match[1]);
    if (target) dependencies.add(target);
  }
  graph.set(normalize(file), dependencies);
}

const visited = new Set();
const active = new Set();
const stack = [];
const cycles = new Set();
function detect(file) {
  if (active.has(file)) {
    const start = stack.indexOf(file);
    cycles.add(
      [...stack.slice(start), file].map((item) => relative(sourceRoot, item)).join(" -> "),
    );
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  active.add(file);
  stack.push(file);
  for (const dependency of graph.get(file) ?? []) detect(dependency);
  stack.pop();
  active.delete(file);
}
for (const file of graph.keys()) detect(file);
for (const cycle of cycles) failures.push(`Circular dependency: ${cycle}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Architecture graph clean: ${sourceFiles.length} source files checked.`);
