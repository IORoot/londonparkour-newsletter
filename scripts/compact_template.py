#!/usr/bin/env python3
"""
One-off / repeatable shrink pass for template.html:
- Remove redundant single-cell wrapper table around .mceTextBlockContainer (same visual).
- Fix CSS descendant selectors to compound selectors (#b22.mceTextBlockContainer).
- Shorten hidden preheader filler div (same purpose, fewer bytes).
- Strip role="presentation", leading indent, and inter-tag whitespace.
Reads ../template.html, writes ../template.html (backup optional).
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "template.html"

# Outer td with id="b…" then Mailchimp's no-op inner table + single inner td.mceTextBlockContainer + one root div.
FLATTEN_RE = re.compile(
    r'<td([^>]*\bid="(b\d+)"[^>]*)>\s*'
    r'<table width="100%" style="border: 0; background-color: transparent; border-radius: 0; border-collapse: separate">\s*'
    r"<tbody>\s*<tr>\s*"
    r'<td style="([^"]*)" class="mceTextBlockContainer">\s*'
    r"(<div\b[\s\S]*?</div>)\s*"
    r"</td>\s*</tr>\s*</tbody>\s*</table>",
    re.IGNORECASE,
)


def flatten_mce_text_block(m: re.Match[str]) -> str:
    outer, bid, inner_style, div = m.group(1), m.group(2), m.group(3), m.group(4)
    valign = ' valign="top"' if 'valign="top"' in outer else ""
    align = ' align="center"' if 'align="center"' in outer else ""
    return f'<td style="{inner_style}"{valign}{align} id="{bid}" class="mceTextBlockContainer">{div}'


def shorten_hidden_preheader(html: str) -> str:
    """Replace giant ZWJ filler with a short equivalent (still forces preview text)."""
    return re.sub(
        r'(<div style="display: none; max-height: 0px; overflow: hidden">)[\s\S]*?(</div>)',
        r"\1"
        + ("&#847; " * 80)
        + r"\2",
        html,
        count=1,
    )


def update_css_selectors(html: str) -> str:
    """#b22 .mceTextBlockContainer -> #b22.mceTextBlockContainer (only bNN ids)."""
    return re.sub(
        r"#(b\d+)\s+\.mceTextBlockContainer\b",
        r"#\1.mceTextBlockContainer",
        html,
    )


def strip_role_presentation(html: str) -> str:
    return html.replace(' role="presentation"', "")


def minify_whitespace(html: str) -> str:
    html = re.sub(r">\s+<", "><", html)
    lines = [ln.lstrip() for ln in html.splitlines()]
    return "\n".join(lines).strip() + "\n"


def main() -> None:
    raw = TEMPLATE.read_text(encoding="utf-8")
    out = raw
    prev = None
    while prev != out:
        prev = out
        out = FLATTEN_RE.sub(flatten_mce_text_block, out)
    out = update_css_selectors(out)
    out = shorten_hidden_preheader(out)
    out = strip_role_presentation(out)
    out = minify_whitespace(out)
    TEMPLATE.write_text(out, encoding="utf-8")


if __name__ == "__main__":
    main()
