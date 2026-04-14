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
| No attribute suffix | `true` or JSON string `"true"` / `"TRUE"` (trimmed, case-insensitive) | No change for that selector. |
| No attribute suffix | `false` or JSON string `"false"` / `"FALSE"` (trimmed, case-insensitive) | Remove **all** matching elements (opening tag through closing tag and contents). |
| No attribute suffix | other string (etc.) | Set **inner HTML** of **all** matches. |
| `selector:attrName` | string, number, or `null` | Set attribute `attrName` on **all** matches (created if missing). `null` becomes an empty attribute value. `attrName` is detected using the substring after the **last** `:` when it matches `^[a-zA-Z][\w-]*$`. |

Examples:

- `".content2": "Hello"` → inner HTML of `.content2` becomes `Hello` for every match.
- `".link4:href": "https://londonparkour.com"` → every `.link4` gets `href` set to that URL.

**Selector colon caveat:** A selector that uses a CSS pseudo-class with a colon (for example `.btn:hover`) can be misread as an attribute rule, because the parser treats a final `:word` as an attribute name when `word` looks like a valid HTML attribute. Prefer concrete classes or IDs for dynamic parts, or avoid pseudo-classes in keys used for replacement.

**Apply order:** All `false` removals run first, then attribute and inner HTML updates, so rules for nodes inside a removed subtree do not leave stale markup behind.

**Make.com / automation:** Some tools send booleans as strings (`"false"`). Those are treated the same as JSON `false` / `true` for remove vs skip. If an empty attribute is dropped from the JSON bundle entirely, use **`null`** for that key so the rule is still applied (for example `".image4:src": null` for `src=""`).

**Duplicate tags (e.g. Outlook `<!--[if mso]>`):** Markup inside IE conditional comments is not in the DOM tree the HTML parser uses. For a **single-class** selector like `.image4`, `src` / `alt` on `img` and `href` on `a` are also patched in the raw HTML so every matching opening tag is updated (including MSO-only copies).

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
  https://api.github.com/repos/IORoot/londonparkour-newsletter/dispatches \
  -d '{"event_type":"render-newsletter","client_payload":{"templateName":"April 2026","rules":[{".title1":"New title"}]}}'
```

### Trigger from Make.com (HTTP module)

Use Make’s **HTTP** > **Make a request** module (or **HTTP** > **Get a file** is not what you want here—you need a custom POST with JSON).

1. **URL**  
   `https://api.github.com/repos/IORoot/londonparkour-newsletter/dispatches`

2. **Method**  
   `POST`

3. **Headers** (add as separate header rows in the module)

   | Name | Value |
   |------|--------|
   | `Accept` | `application/vnd.github+json` |
   | `Authorization` | `Bearer <YOUR_PAT>` |
   | `X-GitHub-Api-Version` | `2022-11-28` |
   | `Content-Type` | `application/json` |

   For **`Authorization`**, use a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) that can call [Create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event): classic PATs typically need the **`repo`** scope; fine-grained PATs are usually scoped to this repository with **Contents** read and write (plus **Metadata** read where GitHub requires it). Store the token in a **Make connection** or **variable** (masked), not as free text in the scenario if you can avoid it.

   **401 Unauthorized:** GitHub only accepts the header name **`Authorization`** (spelling must match exactly; `Authrorization` or other typos are ignored and you get `Requires authentication`). The value must start with **`Bearer `** (space after `Bearer`), then your PAT—for example `Bearer github_pat_...`—not the raw token by itself.

4. **Body type**  
   `JSON` (or “Raw” with content type JSON, depending on your Make UI).

5. **Request content** — JSON object exactly in this shape (map fields from other Make modules as needed):

```json
{
  "event_type": "render-newsletter",
  "client_payload": {
    "templateName": "April 2026",
    "rules": [
        {
          ".section1"  :true,
          ".title1"    :"Intermediate Class",
          ".content1"  :"Content",
          ".link1:href":"https://londonparkour.com",
          ".link1"     :"Class Details",
          ".image1:src":"https://londonparkour.com/wp-content/uploads/1280x1280_white/Kevin_Speed_Vault.png",

          ".section2"  :false,
          ".title2"    :"Intermediate Class",
          ".content2"  :"Content",
          ".link2:href":"https://londonparkour.com",
          ".link2"     :"Class Details",
          ".image2:src":"https://londonparkour.com/wp-content/uploads/1280x1280_white/Kevin_Speed_Vault.png",

          ".section3"  :false,
          ".title3"    :"Intermediate Class",
          ".content3"  :"Content",
          ".link3:href":"https://londonparkour.com",
          ".link3"     :"Class Details",
          ".image3:src":"https://londonparkour.com/wp-content/uploads/1280x1280_white/Kevin_Speed_Vault.png",

          ".section4"  :false,
          ".title4"    :"Intermediate Class",
          ".content4"  :"Content",
          ".link4:href":"https://londonparkour.com",
          ".link4"     :"Class Details",
          ".image4:src":"https://londonparkour.com/wp-content/uploads/1280x1280_white/Kevin_Speed_Vault.png"
      }
    ]
  }
}
```

- `event_type` must match the workflow: **`render-newsletter`** (see [`.github/workflows/render-and-upload.yml`](.github/workflows/render-and-upload.yml)).
- Put your selector map under `client_payload.rules` as either one object or an array of objects (same rules as in [Rules JSON format](#rules-json-format)).
- In Make you can build `client_payload` with the **JSON** > **Create JSON** module, or assemble the whole body with mapped values; ensure booleans stay JSON booleans (`true` / `false`), not strings.

6. **Parse the response**  
   A successful dispatch returns **`204 No Content`** with an empty body. Treat **2xx** as “workflow queued”; open the repo’s **Actions** tab to see the run and Mailchimp result.

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
