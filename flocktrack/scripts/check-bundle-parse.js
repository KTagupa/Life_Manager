const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sourceHtmlPath = path.join(root, "index.source.html");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getScriptPathsFromSourceHtml(html) {
  const scriptPaths = [];
  const scriptTagPattern = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
  let match = scriptTagPattern.exec(html);
  while (match) {
    scriptPaths.push(match[1]);
    match = scriptTagPattern.exec(html);
  }
  return scriptPaths;
}

function buildBundleText(scriptPaths) {
  return scriptPaths.map(scriptPath => {
    const absPath = path.resolve(path.dirname(sourceHtmlPath), scriptPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Missing script file: ${scriptPath}`);
    }
    return `\n/* FILE: ${scriptPath} */\n${readText(absPath)}\n`;
  }).join("");
}

function run() {
  const sourceHtml = readText(sourceHtmlPath);
  const scriptPaths = getScriptPathsFromSourceHtml(sourceHtml);
  if (!scriptPaths.length) {
    throw new Error("No <script src=\"...\"> entries found in index.source.html");
  }

  const bundleText = buildBundleText(scriptPaths);
  new vm.Script(bundleText, {
    filename: "flocktrack-inline-bundle.js"
  });

  console.log("bundle parse check passed");
}

run();
