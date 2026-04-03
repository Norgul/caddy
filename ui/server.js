const express = require("express");
const path = require("path");
const fs = require("fs");
const { parseSites, addSite, removeSite, updateSiteDevMode } = require("./lib/caddyfile");
const { reloadCaddy } = require("./lib/caddy-reload");

const app = express();
const PORT = 3080;

const CADDYFILE_PATH = process.env.CADDYFILE_PATH || "/app/Caddyfile";
const CADDY_HOSTS_PATH = process.env.CADDY_HOSTS_PATH || "/app/caddy-hosts";

// Write a .caddy-hosts file listing all managed domains.
// A host-side sync script reads this and updates macOS /etc/hosts.
function writeCaddyHosts(caddyfileContent) {
  const sites = parseSites(caddyfileContent);
  const lines = sites
    .map((s) => `127.0.0.1\t${s.domain} # caddy-local`)
    .join("\n");
  fs.writeFileSync(CADDY_HOSTS_PATH, lines + "\n");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// GET /api/sites — list all sites
app.get("/api/sites", (req, res) => {
  try {
    const content = fs.readFileSync(CADDYFILE_PATH, "utf-8");
    const sites = parseSites(content);
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sites — add a site
app.post("/api/sites", async (req, res) => {
  try {
    let { domain, port, devMode } = req.body;

    // Validation
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Domain is required" });
    }

    domain = domain.trim().toLowerCase();
    if (!domain.endsWith(".local")) {
      domain += ".local";
    }

    if (!/^[a-z0-9][a-z0-9._-]*\.local$/.test(domain)) {
      return res.status(400).json({ error: "Invalid domain name" });
    }

    port = parseInt(port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({ error: "Port must be between 1 and 65535" });
    }

    // Check for duplicates
    const caddyfile = fs.readFileSync(CADDYFILE_PATH, "utf-8");
    const existing = parseSites(caddyfile);
    if (existing.some((s) => s.domain === domain)) {
      return res.status(400).json({ error: `${domain} already exists` });
    }

    // Update Caddyfile
    const updatedCaddyfile = addSite(caddyfile, domain, port, !!devMode);
    fs.writeFileSync(CADDYFILE_PATH, updatedCaddyfile);

    // Write managed hosts file for sync script
    writeCaddyHosts(updatedCaddyfile);

    // Reload Caddy
    await reloadCaddy(updatedCaddyfile);

    // Return updated list
    const sites = parseSites(updatedCaddyfile);
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// DELETE /api/sites/:domain — remove a site
app.delete("/api/sites/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;

    // Update Caddyfile
    const caddyfile = fs.readFileSync(CADDYFILE_PATH, "utf-8");
    const updatedCaddyfile = removeSite(caddyfile, domain);
    fs.writeFileSync(CADDYFILE_PATH, updatedCaddyfile);

    // Write managed hosts file for sync script
    writeCaddyHosts(updatedCaddyfile);

    // Reload Caddy
    await reloadCaddy(updatedCaddyfile);

    // Return updated list
    const sites = parseSites(updatedCaddyfile);
    res.json(sites);
  } catch (err) {
    if (err.message.includes("system")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Caddy UI running on http://localhost:${PORT}`);
});

module.exports = app;
