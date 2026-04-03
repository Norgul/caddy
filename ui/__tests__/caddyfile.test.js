const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSites, addSite, removeSite } = require("../lib/caddyfile");

describe("parseSites", () => {
  it("parses a Caddyfile with one site", () => {
    const content = `mission-control.local {\n\treverse_proxy host.docker.internal:3333\n}\n`;
    const sites = parseSites(content);
    assert.deepStrictEqual(sites, [
      { domain: "mission-control.local", port: 3333 },
    ]);
  });

  it("parses multiple sites", () => {
    const content = [
      "app.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
      "",
      "api.local {",
      "\treverse_proxy host.docker.internal:8080",
      "}",
    ].join("\n");
    const sites = parseSites(content);
    assert.equal(sites.length, 2);
    assert.deepStrictEqual(sites[0], { domain: "app.local", port: 3000 });
    assert.deepStrictEqual(sites[1], { domain: "api.local", port: 8080 });
  });

  it("marks caddy.local as system", () => {
    const content = `caddy.local {\n\treverse_proxy caddy-ui:3080\n}\n`;
    const sites = parseSites(content);
    assert.deepStrictEqual(sites, [
      { domain: "caddy.local", port: 3080, system: true },
    ]);
  });

  it("ignores global options block", () => {
    const content = [
      "{",
      "\tadmin 0.0.0.0:2019",
      "}",
      "",
      "app.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
    ].join("\n");
    const sites = parseSites(content);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].domain, "app.local");
  });
});

describe("addSite", () => {
  it("appends a new site block", () => {
    const original = `app.local {\n\treverse_proxy host.docker.internal:3000\n}\n`;
    const result = addSite(original, "blog.local", 4000);
    assert.ok(result.includes("blog.local {"));
    assert.ok(result.includes("reverse_proxy host.docker.internal:4000"));
    assert.ok(result.includes("app.local {"));
  });

  it("preserves the global options block", () => {
    const original = [
      "{",
      "\tadmin 0.0.0.0:2019",
      "}",
      "",
      "app.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
    ].join("\n");
    const result = addSite(original, "blog.local", 4000);
    assert.ok(result.includes("admin 0.0.0.0:2019"));
    assert.ok(result.includes("blog.local {"));
  });
});

describe("removeSite", () => {
  it("removes a site block", () => {
    const content = [
      "app.local {",
      "\treverse_proxy host.docker.internal:3000",
      "}",
      "",
      "blog.local {",
      "\treverse_proxy host.docker.internal:4000",
      "}",
    ].join("\n");
    const result = removeSite(content, "blog.local");
    assert.ok(!result.includes("blog.local"));
    assert.ok(result.includes("app.local"));
  });

  it("throws when removing caddy.local", () => {
    const content = `caddy.local {\n\treverse_proxy caddy-ui:3080\n}\n`;
    assert.throws(() => removeSite(content, "caddy.local"), {
      message: /system/i,
    });
  });
});
