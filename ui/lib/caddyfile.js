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

module.exports = { parseSites, addSite, removeSite, updateSiteDevMode };
