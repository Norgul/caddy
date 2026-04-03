const MARKER = "# caddy-local";

function addHost(content, domain) {
  // Check if entry already exists
  const lines = content.split("\n");
  const exists = lines.some(
    (line) => line.includes(domain) && !line.trim().startsWith("#")
  );
  if (exists) return content;

  const entry = `127.0.0.1\t${domain} ${MARKER}`;
  return content.trimEnd() + "\n" + entry + "\n";
}

function removeHost(content, domain) {
  const lines = content.split("\n");
  const result = lines.filter((line) => {
    // Only remove lines we manage (marked with our comment)
    if (line.includes(domain) && line.includes(MARKER)) {
      return false;
    }
    return true;
  });
  return result.join("\n");
}

module.exports = { addHost, removeHost };
