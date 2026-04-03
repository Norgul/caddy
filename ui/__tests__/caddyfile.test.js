const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSites, addSite, removeSite, updateSiteDevMode } = require("../lib/caddyfile");

describe("parseSites", () => {
  it("parses a Caddyfile with one site", () => {
    const content = `mission-control.local {\n\treverse_proxy host.docker.internal:3333\n}\n`;
    const sites = parseSites(content);
    assert.deepStrictEqual(sites, [
      { domain: "mission-control.local", port: 3333, devMode: false },
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
    assert.deepStrictEqual(sites[0], { domain: "app.local", port: 3000, devMode: false });
    assert.deepStrictEqual(sites[1], { domain: "api.local", port: 8080, devMode: false });
  });

  it("marks caddy.local as system", () => {
    const content = `caddy.local {\n\treverse_proxy caddy-ui:3080\n}\n`;
    const sites = parseSites(content);
    assert.deepStrictEqual(sites, [
      { domain: "caddy.local", port: 3080, system: true, devMode: false },
    ]);
  });

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
