import { DEFAULT_SERVER_PORT } from "@greed/protocol";

/** Server URL baked in at build time (e.g. wss://greed-server.example.com). */
const configured = import.meta.env.VITE_SERVER_URL as string | undefined;

const hostname = typeof location !== "undefined" ? location.hostname : "localhost";

const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(hostname);

/** WebSocket URL for the online server. */
export const SERVER_URL: string = configured ?? `ws://${hostname}:${DEFAULT_SERVER_PORT}`;

/**
 * Whether online multiplayer is available in this build. True when a server URL
 * is baked in (VITE_SERVER_URL) or we're running locally against a dev server;
 * false for a static deploy with no server, so the UI can hide the Online entry
 * rather than offer a button that can never connect.
 */
export const ONLINE_ENABLED: boolean = Boolean(configured) || isLocalhost;
