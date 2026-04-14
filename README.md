# London Parkour Newsletter Template

Mailchimp-style HTML in [`template.html`](template.html). Rules JSON (see [`input-example.json`](input-example.json) or [`input.json`](input.json)) drives a small Cheerio transform, then GitHub Actions can push the result to Mailchimp as a new template.

## GitHub secret

Add **`MAILCHIMP_API_KEY`** in the repository secrets. Use your full Marketing API key (Mailchimp shows a string ending with a hyphen and datacenter, for example `...-us17`). The workflow takes the segment after the last hyphen as the API host prefix (`us17` → `https://us17.api.mailchimp.com/...`).

## Rules JSON format

The `rules` value is either:

- a single object of **selector → value**, or
- an **array** of such objects; objects are merged **in order** (later keys override earlier ones).

Each key is interpreted as follows:

| Key pattern | Value | Effect |
|-------------|--------|--------|
| No attribute suffix | `true` | No change for that selector. |
| No attribute suffix | `false` | Remove **all** matching elements (opening tag through closing tag and contents). |
| No attribute suffix | string (etc.) | Set **inner HTML** of **all** matches. |
| `selector:attrName` | string (etc.) | Set attribute `attrName` on **all** matches (created if missing). `attrName` is detected using the substring after the **last** `:` when it matches `^[a-zA-Z][\w-]*$`. |

Examples:

- `".content2": "Hello"` → inner HTML of `.content2` becomes `Hello` for every match.
- `".link4:href": "https://londonparkour.com"` → every `.link4` gets `href` set to that URL.

**Selector colon caveat:** A selector that uses a CSS pseudo-class with a colon (for example `.btn:hover`) can be misread as an attribute rule, because the parser treats a final `:word` as an attribute name when `word` looks like a valid HTML attribute. Prefer concrete classes or IDs for dynamic parts, or avoid pseudo-classes in keys used for replacement.

**Apply order:** All `false` removals run first, then attribute and inner HTML updates, so rules for nodes inside a removed subtree do not leave stale markup behind.

## Local render

```bash
npm ci
jq -n --arg name "My template" --slurpfile rules input.json '{templateName: $name, rules: $rules[0]}' > client_payload.json
npm run render -- --config client_payload.json --template-html template.html --out-dir dist
```

Outputs:

- `dist/rendered.html` — transformed HTML
- `dist/upload.json` — `{"name":"...","html":"..."}` ready for Mailchimp (HTML is a JSON string)

## GitHub Actions

Workflow: [`.github/workflows/render-and-upload.yml`](.github/workflows/render-and-upload.yml).

### Manual run (`workflow_dispatch`)

1. Commit your rules file (default [`input.json`](input.json)) on the branch you want.
2. **Actions** → **Render newsletter and upload to Mailchimp** → **Run workflow**.
3. Choose the **branch**, enter **Mailchimp template name**, and optionally change **rules file** path (repo-relative, default `input.json`).

### API run (`repository_dispatch`)

Call the GitHub REST API with a personal access token that has the **`repo`** scope (classic) or **Contents** read access to the repository (fine-grained), for example:

```bash
curl -L -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_PAT" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{"event_type":"render-newsletter","client_payload":{"templateName":"April 2026","rules":[{".title1":"New title"}]}}'
```

`client_payload` fields:

- **`templateName`** (string, required): Mailchimp template name.
- **`rules`** (object or array of objects, required): selector map as above.

`client_payload` must stay within GitHub’s **65,536 byte** limit.

The job runs `npm ci`, executes [`scripts/render.mjs`](scripts/render.mjs), then POSTs `dist/upload.json` to Mailchimp [`POST /3.0/templates`](https://mailchimp.com/developer/marketing/api/templates/add-template) using HTTP Basic auth (`anystring` as username, API key as password), matching:

```bash
curl -sS -f -X POST "https://YOUR_DC.api.mailchimp.com/3.0/templates" \
  -u "anystring:$MAILCHIMP_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @dist/upload.json
```
