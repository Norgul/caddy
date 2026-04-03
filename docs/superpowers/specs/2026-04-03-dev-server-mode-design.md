# Dev Server Mode Toggle

## Problem

When Caddy reverse-proxies to a local dev server (webpack-dev-server, Vite, Next.js dev), the upstream receives `Host: my-app.local` instead of `Host: localhost:3000`. Dev servers validate the Host header and reject unknown hosts with "Invalid Host header".

## Solution

Add a "Dev server mode" toggle to the Caddy UI that configures `header_up Host localhost:<port>` on the reverse proxy, so the upstream sees `localhost` as the host.

## Caddyfile Output

Without dev mode (current behavior):
```
deepcontext.local {
	reverse_proxy host.docker.internal:3000
}
```

With dev mode enabled:
```
deepcontext.local {
	reverse_proxy host.docker.internal:3000 {
		header_up Host localhost:3000
	}
}
```

## Changes

### 1. `lib/caddyfile.js`

**`parseSites(content)`** - Add `devMode` boolean to each parsed site. Detect by checking for `header_up Host` inside the reverse_proxy sub-block. The parser currently only handles flat directives inside the site block; it must now handle the nested `reverse_proxy { ... }` block.

Parsing approach:
- After matching `reverse_proxy`, check if the line ends with `{` (sub-block) or contains just `host:port` (current flat format)
- For the flat format with a trailing sub-block: match `reverse_proxy host:port {` then scan inner lines for `header_up Host`
- For the simple format: match `reverse_proxy host:port` (no sub-block) as today
- Set `devMode: true` if `header_up Host` is found, `false` otherwise

**`addSite(content, domain, port, devMode)`** - Accept optional `devMode` parameter (default `false`). When true, generate the nested block format.

**New: `updateSiteDevMode(content, domain, devMode)`** - Find the site block for `domain`, then either:
- If enabling: replace `reverse_proxy host.docker.internal:<port>` with the nested block containing `header_up Host localhost:<port>`
- If disabling: replace the nested block with the flat `reverse_proxy host.docker.internal:<port>` line

Throws if domain is a system domain or not found.

### 2. `server.js`

**`POST /api/sites`** - Accept optional `devMode` boolean in request body. Pass to `addSite()`.

**New: `PATCH /api/sites/:domain`** - Accept `{ "devMode": boolean }` in request body. Read Caddyfile, call `updateSiteDevMode()`, write Caddyfile, reload Caddy, return updated sites list. Reject system domains with 400.

Export `updateSiteDevMode` from caddyfile.js.

### 3. `public/index.html`

**Add-site form:** Add a checkbox row below the domain/port row:
- Checkbox with label "Dev server mode"
- Helper text: "Fixes 'Invalid Host header' from webpack, Vite, and similar dev servers"
- Styled to match the existing glassmorphism design (subtle, not heavy)
- Send `devMode` boolean in POST body

**Site list cards:** For non-system sites, add a small toggle/switch next to the delete button:
- Shows current devMode state
- On click, fires `PATCH /api/sites/:domain` with toggled value
- Updates local state and re-renders on success
- Shows toast on error

**renderSites():** Use `site.devMode` to set toggle state. Optionally show a subtle "dev" badge or indicator when devMode is active.

### 4. `__tests__/caddyfile.test.js`

New test cases:

**parseSites:**
- Parses site with `header_up Host` nested block -> `devMode: true`
- Parses site without nested block -> `devMode: false`
- Parses mix of dev-mode and non-dev-mode sites

**addSite:**
- `addSite(content, domain, port, true)` generates nested block with `header_up`
- `addSite(content, domain, port, false)` generates flat format (backward compat)
- `addSite(content, domain, port)` defaults to flat format

**updateSiteDevMode:**
- Enables dev mode on a flat-format site
- Disables dev mode on a nested-block site
- Throws on system domain
- Throws on non-existent domain
- Preserves other sites unchanged

## Out of Scope

- Auto-detection of dev servers
- Other reverse_proxy advanced options (CORS, path stripping, etc.)
- Editing domain or port on existing sites (use delete + re-add)
