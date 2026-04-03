const SYSTEM_DOMAINS = ["caddy.local"];

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

function addSite(content, domain, port) {
  const block = [
    "",
    `${domain} {`,
    `\treverse_proxy host.docker.internal:${port}`,
    "}",
    "",
  ].join("\n");

  return content.trimEnd() + "\n" + block;
}

function removeSite(content, domain) {
  if (SYSTEM_DOMAINS.includes(domain)) {
    throw new Error(`Cannot remove system domain: ${domain}`);
  }

  const lines = content.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const siteMatch = line.match(/^([a-zA-Z0-9._-]+)\s*\{$/);

    if (siteMatch && siteMatch[1] === domain) {
      // Skip this entire block
      i++;
      while (i < lines.length && lines[i].trim() !== "}") {
        i++;
      }
      i++; // skip closing }
      // Skip trailing blank line
      if (i < lines.length && lines[i].trim() === "") {
        i++;
      }
      continue;
    }

    result.push(lines[i]);
    i++;
  }

  return result.join("\n");
}

module.exports = { parseSites, addSite, removeSite };
