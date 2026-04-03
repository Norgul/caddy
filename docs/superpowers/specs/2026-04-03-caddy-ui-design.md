# Caddy Local UI — Design Spec

## Overview

A web-based management UI for Caddy reverse proxy that lets users add and remove local development domains. Runs as a second Docker container alongside Caddy, accessible at `https://caddy.local`.

## Architecture

Two containers in a single `docker-compose.yml`:

### Caddy container (existing, updated)
- Reverse proxy on ports 80/443
- Auto TLS for `.local` domains
- Admin API exposed on `:2019` within the Docker network
- Mounts `./Caddyfile` (read)
- Proxies `caddy.local` → `caddy-ui:3080`

### Caddy UI container (new)
- Node.js + Express app on port 3080
- Mounts `./Caddyfile` (read/write)
- Bind-mounts host `/etc/hosts` (read/write) — requires privileged access
- Reloads Caddy via admin API after changes
- Serves static frontend (single HTML page, no build step)

### Shared resources
- `./Caddyfile` — mounted into both containers
- `/etc/hosts` — bind-mounted into UI container only
- Docker network — UI talks to Caddy admin API at `http://caddy:2019`

## UI Design

Dark glassmorphism aesthetic:
- Background: `#0A0A0B` with animated ambient gradient blurs (violet/indigo/fuchsia)
- Cards: `backdrop-filter: blur(40px)`, `rgba(255,255,255,0.02)` background, `rgba(255,255,255,0.05)` borders
- Typography: Inter font, gradient header text, uppercase labels
- Interactions: hover lifts, delete button turns red on hover, green status dots
- Single page, no framework, vanilla HTML/CSS/JS

### Layout
1. **Header** — "Caddy Local" title with gradient text, subtitle "Manage your local development domains"
2. **Add form** — domain input + port input + Add button, inline in a glass card
3. **Sites list** — each site shows domain, upstream, and Delete button
4. **System entry** — `caddy.local` shown dimmed with "system" badge, not deletable

## API

Base URL: `http://caddy-ui:3080` (proxied via `https://caddy.local`)

### `GET /api/sites`
Returns all sites parsed from the Caddyfile.
```json
[
  { "domain": "mission-control.local", "port": 3333 },
  { "domain": "caddy.local", "port": 3080, "system": true }
]
```

### `POST /api/sites`
Adds a new site.
```json
{ "domain": "my-app", "port": 3000 }
```
- Auto-appends `.local` if not present
- Appends reverse proxy block to Caddyfile
- Appends `127.0.0.1 <domain>` to `/etc/hosts`
- Reloads Caddy via `POST http://caddy:2019/load`
- Returns updated site list

**Validation:**
- Domain must be non-empty, valid hostname characters
- Domain must end in `.local` (auto-appended if missing)
- Port must be a number between 1-65535
- Duplicate domains rejected

### `DELETE /api/sites/:domain`
Removes a site.
- Removes the reverse proxy block from Caddyfile
- Removes the `127.0.0.1 <domain>` line from `/etc/hosts`
- Reloads Caddy
- Returns updated site list
- Rejects deletion of `caddy.local` (system entry)

## Caddy Reload

After modifying the Caddyfile, the UI reloads Caddy using:
```
POST http://caddy:2019/load
Content-Type: text/caddyfile

<contents of Caddyfile>
```

Note: The `text/caddyfile` content type is a Caddy adapter. If this doesn't work, the fallback is to use Caddy's config API with JSON, or simply exec `caddy reload` inside the Caddy container via Docker. The implementation should verify which approach works and use the most reliable one.

## Docker Compose Changes

```yaml
services:
  caddy:
    image: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    extra_hosts:
      - "host.docker.internal:host-gateway"

  caddy-ui:
    build: ./ui
    volumes:
      - ./Caddyfile:/app/Caddyfile
      - /etc/hosts:/app/hosts
    depends_on:
      - caddy

volumes:
  caddy_data:
  caddy_config:
```

## Caddyfile Changes

Add the `caddy.local` entry and a global admin block:

```
{
    admin 0.0.0.0:2019
}

caddy.local {
    reverse_proxy caddy-ui:3080
}

mission-control.local {
    reverse_proxy host.docker.internal:3333
}
```

## Project Structure

```
caddy/
├── Caddyfile
├── docker-compose.yml
└── ui/
    ├── Dockerfile
    ├── package.json
    ├── server.js          # Express app + API routes
    └── public/
        └── index.html     # Static frontend (single file)
```

## Error Handling

- Caddyfile parse/write errors → 500 with error message
- `/etc/hosts` write errors → 500 with error message
- Caddy reload failures → 500 with Caddy's error response
- Validation errors → 400 with field-specific message
- Frontend shows errors as a dismissible toast/banner
