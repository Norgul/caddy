# Dev Server Mode Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Dev server mode" toggle to the Caddy UI so users can fix "Invalid Host header" errors from webpack/Vite dev servers with one click.

**Architecture:** Extend the Caddyfile parser/generator to handle a nested `reverse_proxy` sub-block with `header_up Host localhost:<port>`. Add a PATCH endpoint for toggling on existing sites. Add checkbox on the add form and a toggle switch on each site card.

**Tech Stack:** Node.js + Express backend, vanilla JS frontend, `node:test` for tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `ui/lib/caddyfile.js` | Modify | Parse `devMode`, generate nested blocks, toggle devMode |
| `ui/__tests__/caddyfile.test.js` | Modify | Tests for all new caddyfile.js functionality |
| `ui/server.js` | Modify | Accept `devMode` in POST, add PATCH endpoint |
| `ui/public/index.html` | Modify | Checkbox on form, toggle switch on site cards |

---

### Task 1: Extend `parseSites` to detect dev mode

**Files:**
- Test: `ui/__tests__/caddyfile.test.js`
- Modify: `ui/lib/caddyfile.js:1-53`

- [ ] **Step 1: Write failing tests for devMode parsing**

Add these tests inside the existing `describe("parseSites")` block in `ui/__tests__/caddyfile.test.js`:

```javascript
it("parses site without dev mode as devMode false", () => {
  const content = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
  const sites = parseSites(content);
  assert.deepStrictEqual(sites, [
    { domain: "app.local", port: 3000, devMode: false },
  ]);
});

it("parses site with header_up Host as devMode true", () => {
  const content = [
    "app.local {",
    "\treverse_proxy host.docker.internal:3000 {",
    "\t\theader_up Host localhost:3000",
    "\t}",
    "}",
  ].join("\n");
  const sites = parseSites(content);
  assert.deepStrictEqual(sites, [
    { domain: "app.local", port: 3000, devMode: true },
  ]);
});

it("parses mix of dev-mode and non-dev-mode sites", () => {
  const content = [
    "app.local {",
    "\treverse_proxy host.docker.internal:3000",
    "}",
    "",
    "dev.local {",
    "\treverse_proxy host.docker.internal:4000 {",
    "\t\theader_up Host localhost:4000",
    "\t}",
    "}",
  ].join("\n");
  const sites = parseSites(content);
  assert.equal(sites.length, 2);
  assert.deepStrictEqual(sites[0], { domain: "app.local", port: 3000, devMode: false });
  assert.deepStrictEqual(sites[1], { domain: "dev.local", port: 4000, devMode: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: New tests FAIL (existing site objects don't have `devMode` property). Existing tests will also fail because they don't expect `devMode` in their assertions.

- [ ] **Step 3: Update existing tests to expect devMode**

Update all existing `parseSites` test assertions to include `devMode: false`:

In "parses a Caddyfile with one site":
```javascript
assert.deepStrictEqual(sites, [
  { domain: "mission-control.local", port: 3333, devMode: false },
]);
```

In "parses multiple sites":
```javascript
assert.deepStrictEqual(sites[0], { domain: "app.local", port: 3000, devMode: false });
assert.deepStrictEqual(sites[1], { domain: "api.local", port: 8080, devMode: false });
```

In "marks caddy.local as system":
```javascript
assert.deepStrictEqual(sites, [
  { domain: "caddy.local", port: 3080, system: true, devMode: false },
]);
```

- [ ] **Step 4: Implement parseSites changes**

Replace the `parseSites` function in `ui/lib/caddyfile.js` with:

```javascript
function parseSites(content) {
  const sites = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip global options block (starts with lone `{`)
    if (line === "{") {
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        if (lines[i].trim() === "{") depth++;
        if (lines[i].trim() === "}") depth--;
        i++;
      }
      continue;
    }

    // Match site block: "domain.local {"
    const siteMatch = line.match(/^([a-zA-Z0-9._-]+)\s*\{$/);
    if (siteMatch) {
      const domain = siteMatch[1];
      let port = null;
      let devMode = false;
      i++;

      while (i < lines.length && lines[i].trim() !== "}") {
        const trimmed = lines[i].trim();

        // Match "reverse_proxy host:port {" (sub-block)
        const proxyBlockMatch = trimmed.match(/^reverse_proxy\s+[\w._-]+:(\d+)\s*\{$/);
        if (proxyBlockMatch) {
          port = parseInt(proxyBlockMatch[1], 10);
          i++;
          // Scan sub-block for header_up Host
          while (i < lines.length && lines[i].trim() !== "}") {
            if (lines[i].trim().match(/^header_up\s+Host\s+/)) {
              devMode = true;
            }
            i++;
          }
          i++; // skip sub-block closing }
          continue;
        }

        // Match "reverse_proxy host:port" (flat, no sub-block)
        const proxyMatch = trimmed.match(/^reverse_proxy\s+[\w._-]+:(\d+)$/);
        if (proxyMatch) {
          port = parseInt(proxyMatch[1], 10);
        }
        i++;
      }

      if (port !== null) {
        const site = { domain, port, devMode };
        if (SYSTEM_DOMAINS.includes(domain)) {
          site.system = true;
        }
        sites.push(site);
      }
    }

    i++;
  }

  return sites;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add ui/lib/caddyfile.js ui/__tests__/caddyfile.test.js
git commit -m "feat: parse devMode from Caddyfile reverse_proxy sub-blocks"
```

---

### Task 2: Extend `addSite` to support devMode

**Files:**
- Test: `ui/__tests__/caddyfile.test.js`
- Modify: `ui/lib/caddyfile.js:55-65`

- [ ] **Step 1: Write failing tests for addSite with devMode**

Add these tests inside the existing `describe("addSite")` block:

```javascript
it("adds site with devMode generates nested block", () => {
  const original = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
  const result = addSite(original, "dev.local", 4000, true);
  assert.ok(result.includes("dev.local {"));
  assert.ok(result.includes("reverse_proxy host.docker.internal:4000 {"));
  assert.ok(result.includes("header_up Host localhost:4000"));
});

it("adds site without devMode generates flat format", () => {
  const original = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
  const result = addSite(original, "blog.local", 5000, false);
  assert.ok(result.includes("reverse_proxy host.docker.internal:5000"));
  assert.ok(!result.includes("header_up"));
});

it("adds site with devMode omitted defaults to flat format", () => {
  const original = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
  const result = addSite(original, "blog.local", 5000);
  assert.ok(result.includes("reverse_proxy host.docker.internal:5000"));
  assert.ok(!result.includes("header_up"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: "adds site with devMode generates nested block" FAILS

- [ ] **Step 3: Implement addSite changes**

Replace the `addSite` function in `ui/lib/caddyfile.js`:

```javascript
function addSite(content, domain, port, devMode) {
  let block;
  if (devMode) {
    block = [
      "",
      `${domain} {`,
      `\treverse_proxy host.docker.internal:${port} {`,
      `\t\theader_up Host localhost:${port}`,
      `\t}`,
      "}",
      "",
    ].join("\n");
  } else {
    block = [
      "",
      `${domain} {`,
      `\treverse_proxy host.docker.internal:${port}`,
      "}",
      "",
    ].join("\n");
  }

  return content.trimEnd() + "\n" + block;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add ui/lib/caddyfile.js ui/__tests__/caddyfile.test.js
git commit -m "feat: addSite supports devMode for nested header_up block"
```

---

### Task 3: Implement `updateSiteDevMode`

**Files:**
- Test: `ui/__tests__/caddyfile.test.js`
- Modify: `ui/lib/caddyfile.js`

- [ ] **Step 1: Write failing tests for updateSiteDevMode**

Add a new `describe("updateSiteDevMode")` block at the end of `ui/__tests__/caddyfile.test.js`. Update the require at the top to import `updateSiteDevMode`.

Update the require line:
```javascript
const { parseSites, addSite, removeSite, updateSiteDevMode } = require("../lib/caddyfile");
```

Add the test block:
```javascript
describe("updateSiteDevMode", () => {
  it("enables dev mode on a flat-format site", () => {
    const content = [
      "app.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
    ].join("\n");
    const result = updateSiteDevMode(content, "app.local", true);
    assert.ok(result.includes("reverse_proxy host.docker.internal:3000 {"));
    assert.ok(result.includes("header_up Host localhost:3000"));
  });

  it("disables dev mode on a nested-block site", () => {
    const content = [
      "app.local {",
      "\treverse_proxy host.docker.internal:3000 {",
      "\t\theader_up Host localhost:3000",
      "\t}",
      "}",
    ].join("\n");
    const result = updateSiteDevMode(content, "app.local", false);
    assert.ok(result.includes("reverse_proxy host.docker.internal:3000"));
    assert.ok(!result.includes("header_up"));
    assert.ok(!result.includes("reverse_proxy host.docker.internal:3000 {"));
  });

  it("throws on system domain", () => {
    const content = `caddy.local {\n\treverse_proxy caddy-ui:3080\n}\n`;
    assert.throws(() => updateSiteDevMode(content, "caddy.local", true), {
      message: /system/i,
    });
  });

  it("throws on non-existent domain", () => {
    const content = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
    assert.throws(() => updateSiteDevMode(content, "missing.local", true), {
      message: /not found/i,
    });
  });

  it("preserves other sites unchanged", () => {
    const content = [
      "first.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
      "",
      "second.local {",
      "\treverse_proxy host.docker.internal:4000",
      "}",
    ].join("\n");
    const result = updateSiteDevMode(content, "second.local", true);
    // first.local unchanged
    assert.ok(result.includes("first.local {"));
    assert.ok(result.includes("reverse_proxy host.docker.internal:3000\n"));
    // second.local updated
    assert.ok(result.includes("reverse_proxy host.docker.internal:4000 {"));
    assert.ok(result.includes("header_up Host localhost:4000"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: FAIL — `updateSiteDevMode` is not exported / not defined

- [ ] **Step 3: Implement updateSiteDevMode**

Add the following function to `ui/lib/caddyfile.js` before the `module.exports` line:

```javascript
function updateSiteDevMode(content, domain, devMode) {
  if (SYSTEM_DOMAINS.includes(domain)) {
    throw new Error(`Cannot modify system domain: ${domain}`);
  }

  const lines = content.split("\n");
  const result = [];
  let found = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const siteMatch = line.match(/^([a-zA-Z0-9._-]+)\s*\{$/);

    if (siteMatch && siteMatch[1] === domain) {
      found = true;
      result.push(lines[i]); // keep "domain {"
      i++;

      // Find the reverse_proxy line and extract port
      let port = null;
      while (i < lines.length && lines[i].trim() !== "}") {
        const trimmed = lines[i].trim();

        // Match nested: "reverse_proxy host:port {"
        const blockMatch = trimmed.match(/^reverse_proxy\s+([\w._-]+):(\d+)\s*\{$/);
        if (blockMatch) {
          port = parseInt(blockMatch[2], 10);
          i++;
          // Skip sub-block contents
          while (i < lines.length && lines[i].trim() !== "}") {
            i++;
          }
          i++; // skip sub-block closing }
          continue;
        }

        // Match flat: "reverse_proxy host:port"
        const flatMatch = trimmed.match(/^reverse_proxy\s+([\w._-]+):(\d+)$/);
        if (flatMatch) {
          port = parseInt(flatMatch[2], 10);
          i++;
          continue;
        }

        i++;
      }

      // Write the new reverse_proxy block
      if (devMode) {
        result.push(`\treverse_proxy host.docker.internal:${port} {`);
        result.push(`\t\theader_up Host localhost:${port}`);
        result.push(`\t}`);
      } else {
        result.push(`\treverse_proxy host.docker.internal:${port}`);
      }

      // Push site closing }
      result.push(lines[i]); // "}"
      i++;
      continue;
    }

    result.push(lines[i]);
    i++;
  }

  if (!found) {
    throw new Error(`Domain not found: ${domain}`);
  }

  return result.join("\n");
}
```

Update the `module.exports` line:
```javascript
module.exports = { parseSites, addSite, removeSite, updateSiteDevMode };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add ui/lib/caddyfile.js ui/__tests__/caddyfile.test.js
git commit -m "feat: add updateSiteDevMode to toggle header_up Host"
```

---

### Task 4: Add PATCH endpoint and update POST in server.js

**Files:**
- Modify: `ui/server.js:4` (import), `ui/server.js:38-84` (POST handler), add PATCH handler

- [ ] **Step 1: Update the import line**

In `ui/server.js` line 4, change:
```javascript
const { parseSites, addSite, removeSite } = require("./lib/caddyfile");
```
to:
```javascript
const { parseSites, addSite, removeSite, updateSiteDevMode } = require("./lib/caddyfile");
```

- [ ] **Step 2: Update POST handler to accept devMode**

In `ui/server.js`, in the POST handler, change:
```javascript
let { domain, port } = req.body;
```
to:
```javascript
let { domain, port, devMode } = req.body;
```

And change:
```javascript
const updatedCaddyfile = addSite(caddyfile, domain, port);
```
to:
```javascript
const updatedCaddyfile = addSite(caddyfile, domain, port, !!devMode);
```

- [ ] **Step 3: Add PATCH endpoint**

Add the following handler in `ui/server.js` between the POST and DELETE handlers:

```javascript
// PATCH /api/sites/:domain — toggle dev server mode
app.patch("/api/sites/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;
    const { devMode } = req.body;

    if (typeof devMode !== "boolean") {
      return res.status(400).json({ error: "devMode must be a boolean" });
    }

    // Update Caddyfile
    const caddyfile = fs.readFileSync(CADDYFILE_PATH, "utf-8");
    const updatedCaddyfile = updateSiteDevMode(caddyfile, domain, devMode);
    fs.writeFileSync(CADDYFILE_PATH, updatedCaddyfile);

    // Reload Caddy
    await reloadCaddy(updatedCaddyfile);

    // Return updated list
    const sites = parseSites(updatedCaddyfile);
    res.json(sites);
  } catch (err) {
    if (err.message.includes("system") || err.message.includes("not found")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add ui/server.js
git commit -m "feat: PATCH endpoint for toggling devMode, POST accepts devMode"
```

---

### Task 5: Update frontend — add-form checkbox and site card toggle

**Files:**
- Modify: `ui/public/index.html`

- [ ] **Step 1: Add CSS for the checkbox row and toggle switch**

In `ui/public/index.html`, add the following CSS before the `/* Footer hint */` comment (around line 277):

```css
/* Dev mode checkbox row */
.add-form-options {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  accent-color: #8b5cf6;
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.checkbox-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.25);
}

/* Toggle switch for site cards */
.toggle {
  position: relative;
  width: 36px;
  height: 20px;
  background: rgba(255,255,255,0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s ease;
  border: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.toggle.active {
  background: rgba(139, 92, 246, 0.4);
  border-color: rgba(139, 92, 246, 0.5);
}
.toggle::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: rgba(255,255,255,0.5);
  border-radius: 50%;
  transition: transform 0.2s ease;
}
.toggle.active::after {
  transform: translateX(16px);
  background: rgba(255,255,255,0.9);
}
.dev-label {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  white-space: nowrap;
}
```

- [ ] **Step 2: Add checkbox to the add-form HTML**

In `ui/public/index.html`, after the closing `</form>` tag of the add-form (line 332), replace the form to include the options row. Replace the entire form block:

```html
<form id="add-form">
  <div class="add-form" >
    <div class="field">
      <label>Domain</label>
      <input type="text" id="domain" placeholder="my-app.local" required />
    </div>
    <div class="field field-small">
      <label>Port</label>
      <input type="text" id="port" placeholder="3000" required />
    </div>
    <button type="submit" class="btn-add">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add
    </button>
  </div>
  <div class="add-form-options">
    <label class="checkbox-label">
      <input type="checkbox" id="dev-mode" />
      Dev server mode
    </label>
    <span class="checkbox-hint">Fixes "Invalid Host header" from webpack, Vite, etc.</span>
  </div>
</form>
```

Note: the `<form>` now wraps the outer div. The `id="add-form"` moves to the `<form>` tag, and the inner div gets `class="add-form"` only (no id).

- [ ] **Step 3: Update renderSites to show toggle on non-system sites**

Replace the `renderSites` function in the `<script>` block:

```javascript
function renderSites() {
  const list = document.getElementById("sites-list");
  const count = document.getElementById("sites-count");
  count.textContent = `${sites.length} site${sites.length !== 1 ? "s" : ""}`;

  list.innerHTML = sites.map(site => `
    <div class="site-card${site.system ? " system" : ""}">
      <div class="site-info">
        <div class="site-domain">
          <span class="dot"></span>
          ${site.domain}
        </div>
        <div class="site-upstream">\u2192 host.docker.internal:${site.port}</div>
      </div>
      <div class="site-actions">
        ${site.system
          ? '<span class="badge-system">system</span>'
          : `<span class="dev-label">dev</span>
             <div class="toggle${site.devMode ? " active" : ""}" onclick="toggleDevMode('${site.domain}', ${!site.devMode})"></div>
             <button class="btn-delete" onclick="deleteSite('${site.domain}')">Delete</button>`
        }
      </div>
    </div>
  `).join("");
}
```

- [ ] **Step 4: Update add-form submit handler to send devMode**

Replace the form submit event listener:

```javascript
document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = document.getElementById("domain").value;
  const port = document.getElementById("port").value;
  const devMode = document.getElementById("dev-mode").checked;

  try {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, port: parseInt(port, 10), devMode }),
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to add site");
      return;
    }

    sites = await res.json();
    renderSites();
    document.getElementById("domain").value = "";
    document.getElementById("port").value = "";
    document.getElementById("dev-mode").checked = false;
  } catch (err) {
    showToast("Failed to add site");
  }
});
```

- [ ] **Step 5: Add toggleDevMode function**

Add this function in the `<script>` block, after the `deleteSite` function:

```javascript
async function toggleDevMode(domain, devMode) {
  try {
    const res = await fetch(`/api/sites/${domain}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devMode }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to update site");
      return;
    }
    sites = await res.json();
    renderSites();
  } catch (err) {
    showToast("Failed to update site");
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add ui/public/index.html
git commit -m "feat: dev server mode checkbox and toggle in UI"
```

---

### Task 6: End-to-end smoke test

- [ ] **Step 1: Run all unit tests**

Run: `cd ui && node --test __tests__/caddyfile.test.js`
Expected: ALL tests PASS

- [ ] **Step 2: Run the hosts tests too**

Run: `cd ui && node --test __tests__/hosts.test.js`
Expected: ALL tests PASS

- [ ] **Step 3: Rebuild and restart the containers**

Run: `cd /Users/marko/Projects/caddy && docker compose up -d --build`
Expected: Both `caddy` and `caddy-ui` containers start successfully

- [ ] **Step 4: Verify the UI loads**

Run: `curl -s http://localhost:3080 | head -5`
Expected: HTML response with `<title>Caddy Local</title>`

- [ ] **Step 5: Verify the API returns devMode**

Run: `curl -s http://localhost:3080/api/sites | python3 -m json.tool`
Expected: Each site object includes a `devMode` field (boolean)

- [ ] **Step 6: Commit any final fixes if needed**
