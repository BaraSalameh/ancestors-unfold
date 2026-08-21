import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const assetDirectory = join(process.cwd(), ".output", "public", "assets");
const files = readdirSync(assetDirectory).filter((file) => file.endsWith(".js"));
const source = new Map(
  files.map((file) => [file, readFileSync(join(assetDirectory, file), "utf8")]),
);
const gzipKilobytes = new Map(
  [...source].map(([file, contents]) => [file, gzipSync(contents).byteLength / 1024]),
);

function routeFiles(prefix) {
  return files.filter((file) => file.startsWith(prefix));
}

const failures = [];
const dashboardEntry = files.find((file) => /^index-[\w-]+\.js$/.test(file));
if (!dashboardEntry) failures.push("The production client entry was not found.");

const standardRoutes = [
  "activity-",
  "analysis-",
  "auth-",
  "branches-",
  "edit._id-",
  "invitation._token-",
  "member._id-",
  "profile-",
  "reset-password-",
  "settings-",
  "tree._id_.add-",
];

const measurements = [];
if (dashboardEntry) {
  const dashboard = gzipKilobytes.get(dashboardEntry) ?? 0;
  measurements.push(["dashboard", dashboard, 200]);
  for (const prefix of standardRoutes) {
    const roots = routeFiles(prefix);
    if (!roots.length) continue;
    const routeSize = roots.reduce(
      (total, file) => total + (gzipKilobytes.get(file) ?? 0),
      dashboard,
    );
    measurements.push([prefix.slice(0, -1), routeSize, 200]);
  }
  const treeRoots = routeFiles("tree._id-").filter((file) => !file.startsWith("tree._id_.add-"));
  const familyTree = routeFiles("family-tree-").filter((file) => file.endsWith(".js"));
  measurements.push([
    "tree editor total",
    [...treeRoots, ...familyTree].reduce(
      (total, file) => total + (gzipKilobytes.get(file) ?? 0),
      dashboard,
    ),
    300,
  ]);
}

for (const [name, size, budget] of measurements) {
  const rounded = Math.round(size * 100) / 100;
  console.log(`${name}: ${rounded} kB gzip (budget ${budget} kB)`);
  if (size > budget) failures.push(`${name} is ${rounded} kB gzip; budget is ${budget} kB.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
