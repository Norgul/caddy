const CADDY_ADMIN_URL =
  process.env.CADDY_ADMIN_URL || "http://caddy:2019";

async function reloadCaddy(caddyfileContent) {
  const response = await fetch(`${CADDY_ADMIN_URL}/load`, {
    method: "POST",
    headers: { "Content-Type": "text/caddyfile" },
    body: caddyfileContent,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Caddy reload failed (${response.status}): ${body}`);
  }

  return true;
}

module.exports = { reloadCaddy };
