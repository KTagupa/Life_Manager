const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceFile = path.join(root, "index.source.html");
const outputFile = path.join(root, "index.html");
const buildDir = path.join(root, "build");
const swSourceFile = path.join(root, "sw.source.js");
const swOutputFile = path.join(root, "sw.js");
const generatedHtmlComment = "<!-- Generated from index.source.html. Edit source, then run npm run build. -->";
const generatedSwComment = "// Generated from sw.source.js. Edit source, then run npm run build.";
const generatedBundleComment = ref => `// Generated bundle: ${ref}. Edit source files, then run npm run build.`;
const startupBundleRefs = ["build/vendor.js", "build/app.js"];
const bundleConfigs = [{
  ref: "build/vendor.js",
  files: ["src/vendor/react.production.min.js", "src/vendor/react-dom.production.min.js"]
}, {
  ref: "build/app.js",
  files: ["src/core/runtime.js", "src/core/logic.shared.js", "src/core/db.js", "src/core/data-layer.js", "src/core/ui-core.js", "src/components/primitives.js", "src/components/bird-ui.js", "src/screens/dashboard.js", "src/core/pwa.js", "src/app-shell.js"]
}, {
  ref: "build/chunk-hatchery.js",
  files: ["src/screens/batches.js", "src/screens/workspaces.js"]
}, {
  ref: "build/chunk-pens.js",
  files: ["src/screens/pens.js"]
}, {
  ref: "build/chunk-flock.js",
  files: ["src/screens/birds.js"]
}, {
  ref: "build/chunk-settings.js",
  files: ["src/screens/reminders.js", "src/screens/export.js", "src/screens/settings.js"]
}, {
  ref: "build/chunk-finance.js",
  files: ["src/screens/finance.js"]
}, {
  ref: "build/chunk-stats.js",
  files: ["src/screens/stats.js"]
}];
const requiredAssetRefs = ["manifest.webmanifest", "assets/icons/pens-nest-chicks-icon.png", "assets/pwa/icon-192.png", "assets/pwa/icon-512.png", "assets/stages/broiler.png", "assets/stages/chick.png", "assets/stages/egg.png", "assets/stages/grower.png", "assets/stages/layer.png", "assets/stages/pullet.png", "assets/stages/retired.png", "assets/stages/rooster.png"];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function normalizeRefPath(refPath) {
  return refPath.replace(/\\/g, "/");
}

function resolveFromRoot(refPath) {
  return path.resolve(root, refPath);
}

function ensureFileExists(refPath) {
  const filePath = resolveFromRoot(refPath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${refPath}`);
  return filePath;
}

function uniqueRefs(refPaths) {
  const seen = new Set();
  return refPaths.filter(refPath => {
    if (seen.has(refPath)) return false;
    seen.add(refPath);
    return true;
  });
}

function isLocalRef(refPath) {
  return !!refPath && !/^(?:[a-z]+:)?\/\//i.test(refPath) && !refPath.startsWith("data:") && !refPath.startsWith("#");
}

function collectAssetRefsFromHtml(html) {
  const refs = [];
  const attrPattern = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/g;
  let match = attrPattern.exec(html);
  while (match) {
    const refPath = normalizeRefPath(String(match[1] || "").trim());
    if (isLocalRef(refPath)) refs.push(refPath);
    match = attrPattern.exec(html);
  }
  return refs;
}

function addGeneratedComment(html) {
  if (!/^<!DOCTYPE html>/i.test(html)) {
    throw new Error("Source HTML must start with <!DOCTYPE html>.");
  }
  return html.replace(/^<!DOCTYPE html>\s*/i, `<!DOCTYPE html>\n${generatedHtmlComment}\n`);
}

function bundleScriptBlock(scriptRefs) {
  return scriptRefs.map(ref => `<script defer src="${ref}"></script>`).join("\n");
}

function stripSourceScripts(html) {
  return html.replace(/\s*<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, "");
}

function buildBundleText(refPath, sourceRefs) {
  return `${generatedBundleComment(refPath)}\n${sourceRefs.map(sourceRef => {
    const sourcePath = ensureFileExists(sourceRef);
    const sourceText = readText(sourcePath).trimEnd();
    return `\n/* FILE: ${sourceRef} */\n${sourceText}\n`;
  }).join("")}`;
}

function writeTextFile(refPath, text) {
  const filePath = resolveFromRoot(refPath);
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, {
    recursive: true
  });
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`);
}

function buildBundles() {
  fs.mkdirSync(buildDir, {
    recursive: true
  });
  bundleConfigs.forEach(config => {
    writeTextFile(config.ref, buildBundleText(config.ref, config.files));
  });
  return bundleConfigs.map(config => config.ref);
}

function buildIndexHtml() {
  let html = readText(sourceFile);
  html = addGeneratedComment(html);
  html = stripSourceScripts(html);
  html = html.replace(/\s*<\/body>/i, `\n${bundleScriptBlock(startupBundleRefs)}\n</body>`);
  if (!html.endsWith("\n")) html += "\n";
  fs.writeFileSync(outputFile, html);
  return html;
}

function buildPrecacheRefs(indexHtml, bundleRefs) {
  const refs = uniqueRefs(["index.html", ...collectAssetRefsFromHtml(indexHtml), ...bundleRefs, ...requiredAssetRefs]);
  refs.forEach(ensureFileExists);
  return refs;
}

function buildCacheVersion(indexHtml, swTemplate, precacheRefs) {
  const hash = crypto.createHash("sha256");
  hash.update(indexHtml);
  hash.update(swTemplate);
  precacheRefs.filter(refPath => refPath !== "index.html").forEach(refPath => {
    hash.update(readBuffer(resolveFromRoot(refPath)));
  });
  return hash.digest("hex").slice(0, 12);
}

function buildServiceWorker(indexHtml, precacheRefs) {
  const swTemplate = readText(swSourceFile);
  const cacheVersion = buildCacheVersion(indexHtml, swTemplate, precacheRefs);
  let swText = swTemplate.replace("__CACHE_VERSION__", cacheVersion).replace("__PRECACHE_URLS__", JSON.stringify(precacheRefs, null, 2));
  swText = `${generatedSwComment}\n${swText}`;
  writeTextFile(path.relative(root, swOutputFile), swText);
}

function build() {
  const bundleRefs = buildBundles();
  const indexHtml = buildIndexHtml();
  const precacheRefs = buildPrecacheRefs(indexHtml, bundleRefs);
  buildServiceWorker(indexHtml, precacheRefs);
}

build();
