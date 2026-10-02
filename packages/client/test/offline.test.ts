import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { PUBLIC_SHELL_FILES, renderOfflineWorker } from "../build/offline.js";

const ORIGIN = "https://greed.example";
const TEMPLATE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const FILES = [
  "assets/index-home.js",
  "assets/local-unopened.js",
  "assets/bots-unopened.js",
  "assets/index-style.css",
];
const SHELL = [
  "/index.html",
  "/favicon.svg",
  "/icon-maskable.svg",
  "/manifest.webmanifest",
  "/fonts/fraunces-var-v1.woff2",
  "/fonts/nunito-sans-var-v1.woff2",
];

type Input = string | { url: string };
const key = (input: Input) => new URL(typeof input === "string" ? input : input.url, ORIGIN).href;

class WorkerRequest extends Request {
  constructor(input: string, options?: RequestInit) {
    super(key(input), options);
  }
}

class FakeCache {
  entries = new Map<string, Response>();
  constructor(private network: (request: Input) => Promise<Response>) {}
  async addAll(requests: Input[]) {
    const responses = await Promise.all(requests.map((request) => this.network(request)));
    if (responses.some((response) => !response.ok)) throw new TypeError("Precache failed");
    requests.forEach((request, index) => this.entries.set(key(request), responses[index].clone()));
  }
  async put(request: Input, response: Response) {
    this.entries.set(key(request), response.clone());
  }
  async match(request: Input) {
    return this.entries.get(key(request))?.clone();
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(request: Input) {
    return this.entries.delete(key(request));
  }
}

type CachedBuilds = Map<string, FakeCache>;
type FakeRequest = {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: Headers;
};
type Extendable = {
  waitUntil(promise: Promise<unknown>): void;
  request?: FakeRequest;
  respondWith?(promise: Promise<Response>): void;
};

function worker(html = "shell-A", files = FILES, builds: CachedBuilds = new Map()) {
  const rendered = renderOfflineWorker(TEMPLATE, files, html);
  const listeners = new Map<string, (event: Extendable) => void>();
  const state = { offline: false, html, status: 200 };
  const network = vi.fn(async (request: Input) => {
    if (state.offline) throw new TypeError("Offline");
    const path = new URL(key(request)).pathname;
    return new Response(
      path === "/index.html" || !/\.[a-z0-9]+$/i.test(path) ? state.html : `asset:${path}`,
      { status: state.status },
    );
  });
  const caches = {
    async open(name: string) {
      if (!builds.has(name)) builds.set(name, new FakeCache(network));
      return builds.get(name)!;
    },
    async keys() {
      return [...builds.keys()];
    },
    async delete(name: string) {
      return builds.delete(name);
    },
    async match(request: Input) {
      for (const cache of builds.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
  };
  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn();
  runInNewContext(rendered.source, {
    self: {
      location: { origin: ORIGIN },
      clients: { claim },
      skipWaiting,
      addEventListener: (type: string, callback: (event: Extendable) => void) =>
        listeners.set(type, callback),
    },
    caches,
    fetch: network,
    URL,
    Request: WorkerRequest,
    Response,
  });

  async function lifecycle(type: "install" | "activate") {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  }
  async function request(path: string, options: Partial<Omit<FakeRequest, "url">> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: {
        url: key(path),
        method: "GET",
        mode: "cors",
        destination: "",
        headers: new Headers(),
        ...options,
      },
      waitUntil: (promise) => pending.push(promise),
      respondWith: (promise) => {
        response = promise;
      },
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return {
    assets: rendered.assets,
    cacheName: `greed-shell-${rendered.revision}`,
    lifecycle,
    request,
    builds,
    caches,
    state,
    network,
    claim,
    skipWaiting,
  };
}

describe("offline build manifest", () => {
  it("includes every JS/CSS chunk but excludes media, maps and other output", () => {
    const result = renderOfflineWorker(
      TEMPLATE,
      [...FILES, "assets/music.mp3", "assets/video.webm", "assets/index.js.map", "index.html"],
      "shell-A",
    );
    expect(result.assets).toEqual(FILES.map((file) => `/${file}`).sort());
    expect(result.source).not.toContain("__GREED_BUILD_");
    expect(result.source).toContain(result.revision);
  });

  it("is deterministic and changes with output names, HTML or worker behavior", () => {
    const a = renderOfflineWorker(TEMPLATE, FILES, "shell-A").revision;
    expect(renderOfflineWorker(TEMPLATE, [...FILES].reverse(), "shell-A").revision).toBe(a);
    expect(
      renderOfflineWorker(TEMPLATE, [...FILES, "assets/fresh.js"], "shell-A").revision,
    ).not.toBe(a);
    expect(renderOfflineWorker(TEMPLATE, FILES, "shell-B").revision).not.toBe(a);
    expect(
      renderOfflineWorker(TEMPLATE + "\n// changed worker", FILES, "shell-A").revision,
    ).not.toBe(a);
  });

  it("fails the build if the worker template cannot receive its manifest", () => {
    expect(() => renderOfflineWorker("const stale = true;", FILES, "shell-A")).toThrow(
      "build manifest markers",
    );
  });

  it("updates the worker when only an unversioned public shell file changes", () => {
    expect(PUBLIC_SHELL_FILES).toEqual(SHELL.slice(1).map((path) => path.slice(1)));
    const before = new Map([
      ["favicon.svg", Buffer.from("old icon")],
      ["fonts/fraunces-var-v1.woff2", Buffer.from("old font")],
    ]);
    const revision = renderOfflineWorker(TEMPLATE, FILES, "shell-A", before).revision;
    expect(
      renderOfflineWorker(TEMPLATE, FILES, "shell-A", new Map([...before].reverse())).revision,
    ).toBe(revision);
    for (const file of before.keys()) {
      const changed = new Map(before);
      changed.set(file, Buffer.from("changed public file"));
      expect(renderOfflineWorker(TEMPLATE, FILES, "shell-A", changed).revision).not.toBe(revision);
    }
  });
});

describe("production service worker", () => {
  it("precaches the exact shell and all unopened chunks before install completes", async () => {
    const app = worker();
    await app.lifecycle("install");
    expect(
      app.network.mock.calls.map(([request]) => new URL(key(request)).pathname).sort(),
    ).toEqual([...SHELL, ...app.assets].sort());
    expect(
      app.network.mock.calls.every(([request]) => (request as Request).cache === "reload"),
    ).toBe(true);
    expect(app.skipWaiting).not.toHaveBeenCalled();
    app.state.offline = true;
    for (const path of ["/assets/local-unopened.js", "/assets/bots-unopened.js", SHELL[4]]) {
      expect(await (await app.request(path))!.text()).toBe(`asset:${path}`);
    }
    expect(app.network).toHaveBeenCalledTimes(SHELL.length + FILES.length);
  });

  it("rejects a failed precache instead of activating an incomplete offline build", async () => {
    const app = worker();
    app.state.status = 404;
    await expect(app.lifecycle("install")).rejects.toThrow("Precache failed");
    expect(app.builds.get(app.cacheName)!.entries.size).toBe(0);
  });

  it("uses its own shell offline even when the previous cache was created first", async () => {
    const old = worker("shell-A");
    await old.lifecycle("install");
    const app = worker("shell-B", ["assets/index-new.js"], old.builds);
    await app.lifecycle("install");
    await app.lifecycle("activate");
    app.state.offline = true;
    expect(await (await app.request("/?local", { mode: "navigate" }))!.text()).toBe("shell-B");
    expect(app.builds.has(old.cacheName)).toBe(true);
    expect(app.claim).toHaveBeenCalledOnce();
  });

  it("refreshes the canonical offline shell from a successful online navigation", async () => {
    const app = worker();
    await app.lifecycle("install");
    app.state.html = "fresh deployed shell";
    expect(await (await app.request("/?bots", { mode: "navigate" }))!.text()).toBe(
      "fresh deployed shell",
    );
    app.state.offline = true;
    expect(await (await app.request("/?local", { mode: "navigate" }))!.text()).toBe(
      "fresh deployed shell",
    );
    expect(await app.builds.get(app.cacheName)!.match("/?bots")).toBeUndefined();
  });

  it("falls back on server errors without replacing the working cached shell", async () => {
    const app = worker();
    await app.lifecycle("install");
    app.state.status = 503;
    expect(await (await app.request("/", { mode: "navigate" }))!.text()).toBe("shell-A");
    app.state.offline = true;
    expect(await (await app.request("/", { mode: "navigate" }))!.text()).toBe("shell-A");
  });

  it("keeps old chunks usable while waiting and retains one prior build on activation", async () => {
    const first = worker("first", ["assets/first.js"]);
    await first.lifecycle("install");
    const second = worker("second", ["assets/second.js"], first.builds);
    await second.lifecycle("install");
    const third = worker("third", ["assets/third.js"], first.builds);
    await third.lifecycle("install");
    await third.caches.open("another-app-cache");
    expect(third.builds.has(first.cacheName)).toBe(true);
    third.state.offline = true;
    expect(await (await third.request("/assets/first.js"))!.text()).toBe("asset:/assets/first.js");
    await third.lifecycle("activate");
    expect([...third.builds.keys()]).toEqual([
      second.cacheName,
      third.cacheName,
      "another-app-cache",
    ]);
    expect(await (await third.request("/assets/second.js"))!.text()).toBe(
      "asset:/assets/second.js",
    );
    expect(third.skipWaiting).not.toHaveBeenCalled();
  });

  it("serves current static shell files ahead of an older build's copies", async () => {
    const old = worker();
    await old.lifecycle("install");
    await old.builds.get(old.cacheName)!.put("/favicon.svg", new Response("old icon"));
    const app = worker("shell-B", FILES, old.builds);
    await app.lifecycle("install");
    expect(await (await app.request("/favicon.svg"))!.text()).toBe("asset:/favicon.svg");
  });

  it("uses true cache-first for hashed files without a background network fetch", async () => {
    const app = worker();
    await app.lifecycle("install");
    app.network.mockClear();
    await app.request("/assets/local-unopened.js");
    await app.request("/assets/local-unopened.js");
    expect(app.network).not.toHaveBeenCalled();
    expect(await (await app.request("/images/new.svg"))!.text()).toBe("asset:/images/new.svg");
    app.state.offline = true;
    expect(await (await app.request("/images/new.svg"))!.text()).toBe("asset:/images/new.svg");
    expect(app.network).toHaveBeenCalledOnce();
  });

  it("bypasses cross-origin, API, non-GET, media, range and non-static requests", async () => {
    const app = worker();
    for (const [path, options] of [
      ["https://server.example/api/daily", {}],
      ["/api/daily", {}],
      ["/api/avatar.svg", { destination: "image" }],
      ["/sw.js", { destination: "script" }],
      ["/assets/local-unopened.js", { method: "POST" }],
      ["/music.mp3", {}],
      ["/video.webm", {}],
      ["/stream", { destination: "audio" }],
      ["/stream", { destination: "video" }],
      ["/image.png", { headers: new Headers({ range: "bytes=0-100" }) }],
      ["/account", {}],
    ] as [string, Partial<FakeRequest>][]) {
      expect(await app.request(path, options)).toBeUndefined();
    }
    expect(app.network).not.toHaveBeenCalled();
    expect(app.builds.size).toBe(0);
  });

  it("bounds concurrent runtime assets without evicting any required precached chunk", async () => {
    const app = worker();
    await app.lifecycle("install");
    await Promise.all(
      Array.from({ length: 75 }, (_, i) => app.request(`/images/runtime-${i}.svg`)),
    );
    const runtime = app.builds.get("greed-runtime-v1")!;
    expect(runtime.entries.size).toBe(60);
    expect(await runtime.match("/images/runtime-0.svg")).toBeUndefined();
    expect(await runtime.match("/images/runtime-74.svg")).toBeDefined();
    expect(app.builds.get(app.cacheName)!.entries.size).toBe(SHELL.length + FILES.length);
    app.state.offline = true;
    expect(await (await app.request("/assets/bots-unopened.js"))!.text()).toBe(
      "asset:/assets/bots-unopened.js",
    );
  });
});
