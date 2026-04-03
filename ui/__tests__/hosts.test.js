const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { addHost, removeHost } = require("../lib/hosts");

describe("addHost", () => {
  it("appends a new host entry", () => {
    const original = "127.0.0.1\tlocalhost\n";
    const result = addHost(original, "app.local");
    assert.ok(result.includes("127.0.0.1\tapp.local"));
    assert.ok(result.includes("127.0.0.1\tlocalhost"));
  });

  it("does not duplicate existing entries", () => {
    const original = "127.0.0.1\tlocalhost\n127.0.0.1\tapp.local\n";
    const result = addHost(original, "app.local");
    const matches = result.match(/app\.local/g);
    assert.equal(matches.length, 1);
  });

  it("adds a managed-by comment", () => {
    const original = "127.0.0.1\tlocalhost\n";
    const result = addHost(original, "app.local");
    assert.ok(result.includes("# caddy-local"));
  });
});

describe("removeHost", () => {
  it("removes a managed host entry", () => {
    const original =
      "127.0.0.1\tlocalhost\n127.0.0.1\tapp.local # caddy-local\n";
    const result = removeHost(original, "app.local");
    assert.ok(!result.includes("app.local"));
    assert.ok(result.includes("localhost"));
  });

  it("does not remove unmanaged entries", () => {
    const original = "127.0.0.1\tapp.local\n";
    const result = removeHost(original, "app.local");
    assert.ok(result.includes("app.local"));
  });
});
