import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const ATTR_SUFFIX = /^[a-zA-Z][\w-]*$/;
/** Selectors like `.image4` only (for string-level patches inside IE conditional comments). */
const SINGLE_CLASS_SELECTOR = /^\.[\w-]+$/;

function escapeAttrDoubleQuoted(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function tagForAttrPatch(attr) {
  if (attr === "src" || attr === "alt") return "img";
  if (attr === "href") return "a";
  return null;
}

/**
 * Outlook / MSO blocks live inside `<!--[if mso]>...<![endif]-->`; the HTML parser treats that as
 * a comment, so Cheerio never sees those nodes. Patch matching opening tags in the raw string.
 */
function patchAttrByClassInRawHtml(html, selector, attr, strVal) {
  if (!SINGLE_CLASS_SELECTOR.test(selector)) return html;
  const tag = tagForAttrPatch(attr);
  if (!tag) return html;
  const className = selector.slice(1);
  const classTokenRe = new RegExp(`(?:^|\\s)${className}(?:\\s|$)`);
  const quoted = escapeAttrDoubleQuoted(strVal);
  const tagOpenRe = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  return html.replace(tagOpenRe, (full, inner) => {
    const cm = inner.match(/\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i);
    const cls = cm && (cm[1] ?? cm[2]);
    if (!cls || !classTokenRe.test(cls)) return full;
    const dq = new RegExp(`\\s${attr}\\s*=\\s*"[^"]*"`, "i");
    const sq = new RegExp(`\\s${attr}\\s*=\\s*'[^']*'`, "i");
    let next = inner;
    if (dq.test(next)) next = next.replace(dq, ` ${attr}="${quoted}"`);
    else if (sq.test(next)) next = next.replace(sq, ` ${attr}="${quoted}"`);
    else next = `${next} ${attr}="${quoted}"`;
    return `<${tag}${next}>`;
  });
}

/** Treat JSON/boolean and common string forms from tools like Make.com */
function isTruthy(value) {
  if (value === true) return true;
  if (typeof value === "string" && value.trim().toLowerCase() === "true") return true;
  return false;
}

function isFalsey(value) {
  if (value === false) return true;
  if (typeof value === "string" && value.trim().toLowerCase() === "false") return true;
  return false;
}

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
    if (!isFalsey(value)) continue;
    const { selector } = parseRuleKey(key);
    $(selector).remove();
  }

  for (const [key, value] of entries) {
    if (isTruthy(value) || isFalsey(value)) continue;
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

  let out = $.html();
  for (const [key, value] of entries) {
    if (isTruthy(value) || isFalsey(value)) continue;
    const { selector, attr } = parseRuleKey(key);
    if (!attr) continue;
    const strVal = value === null || value === undefined ? "" : String(value);
    out = patchAttrByClassInRawHtml(out, selector, attr, strVal);
  }
  return out;
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
