import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const ATTR_SUFFIX = /^[a-zA-Z][\w-]*$/;

function parseRuleKey(key) {
  const idx = key.lastIndexOf(":");
  if (idx <= 0) return { selector: key, attr: null };
  const rhs = key.slice(idx + 1);
  if (ATTR_SUFFIX.test(rhs)) return { selector: key.slice(0, idx), attr: rhs };
  return { selector: key, attr: null };
}

function mergeRules(rules) {
  if (Array.isArray(rules)) {
    if (rules.length === 0) return {};
    return Object.assign({}, ...rules.map((r) => {
      if (r === null || typeof r !== "object" || Array.isArray(r)) {
        throw new Error("rules array entries must be plain objects");
      }
      return r;
    }));
  }
  if (rules !== null && typeof rules === "object" && !Array.isArray(rules)) {
    return { ...rules };
  }
  throw new Error("rules must be a non-null object or an array of objects");
}

function readConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  const templateName = cfg.templateName ?? cfg.template_name;
  if (!templateName || typeof templateName !== "string") {
    throw new Error("config must include templateName (string)");
  }
  if (cfg.rules === undefined) throw new Error("config must include rules");
  return { templateName, merged: mergeRules(cfg.rules) };
}

function applyRules(html, merged) {
  const $ = cheerio.load(html, { decodeEntities: false });

  const entries = Object.entries(merged);

  for (const [key, value] of entries) {
    if (value !== false) continue;
    const { selector } = parseRuleKey(key);
    $(selector).remove();
  }

  for (const [key, value] of entries) {
    if (value === true || value === false) continue;
    const { selector, attr } = parseRuleKey(key);
    const els = $(selector);
    if (attr) {
      const strVal = value === null || value === undefined ? "" : String(value);
      els.each((_, el) => {
        $(el).attr(attr, strVal);
      });
    } else {
      els.html(String(value));
    }
  }

  return $.html();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--template-html") out.templateHtml = argv[++i];
    else if (a === "--out-dir") out.outDir = argv[++i];
  }
  return out;
}

function main() {
  const { config, templateHtml = "template.html", outDir = "dist" } = parseArgs(process.argv);
  if (!config) {
    console.error("Usage: node scripts/render.mjs --config <config.json> [--template-html path] [--out-dir path]");
    process.exit(1);
  }

  const { templateName, merged } = readConfig(config);
  const templatePath = path.resolve(templateHtml);
  const html = fs.readFileSync(templatePath, "utf8");
  const rendered = applyRules(html, merged);

  fs.mkdirSync(outDir, { recursive: true });
  const renderedPath = path.join(outDir, "rendered.html");
  const uploadPath = path.join(outDir, "upload.json");
  fs.writeFileSync(renderedPath, rendered, "utf8");
  fs.writeFileSync(
    uploadPath,
    JSON.stringify({ name: templateName, html: rendered }),
    "utf8"
  );

  console.log(`Wrote ${renderedPath} and ${uploadPath}`);
}

main();
