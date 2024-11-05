import { after, afterEach, beforeEach, it } from "node:test";
import * as assert from "assert";
import * as net from "node:net";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { createProxyServer, waitForConnect } from "@e9x/simple-socks";
import { getLocal, Mockttp, MockttpOptions } from "mockttp";
import { Agent, Dispatcher, fetch, MessageEvent, WebSocket } from "undici";
import { socksConnector, socksDispatcher } from "./index.js";

const kGlobalDispatcher = Symbol.for("undici.globalDispatcher.1");

declare const global: typeof globalThis & {
	[kGlobalDispatcher]?: Dispatcher;
};

function setupHttpServer(options?: MockttpOptions) {
	const server = getLocal(options);
	beforeEach(() => server.start());
	afterEach(() => server.stop());
	return server;
}

type AuthFn = NonNullable<Parameters<typeof createProxyServer>[0]>["authenticate"];

function setupSocksServer(authenticate?: AuthFn) {
	let inbound: net.Socket;
	let outbound: net.Socket;

	const server = createProxyServer({
		authenticate,

		async connect(port: number, host: string) {
			outbound = net.connect(port, host);
			await waitForConnect(outbound);
			return outbound;
		},

		filter(port: number, host: string, socket: net.Socket) {
			inbound = socket;
			return true;
		},
	});

	server.listen();
	after(() => void server.close());

	return {
		get inbound() { return inbound; },
		get outbound() { return outbound; },
		...server.address() as net.AddressInfo,
	};
}

function setupWSServer() {
	const server = new WebSocketServer({ port: 0 });
	let inbound: net.Socket;

	server.on("connection", (ws, request) => {
		inbound = request.socket;
		ws.on("message", (m, isBinary) => {
			ws.send(m, { binary: isBinary });
		});
	});

	after(() => void server.close());

	return {
		get inbound() { return inbound; },
		...server.address() as net.AddressInfo,
	};
}

const httpServer = setupHttpServer();
const wsServer = setupWSServer();

const secureServer = setupHttpServer({
	https: {
		keyPath: "fixtures/localhost.pvk",
		certPath: "fixtures/localhost.pem",
	},
});

const plainProxy = setupSocksServer();

const secureProxy = setupSocksServer((username, password) => {
	return username === "foo" && password === "bar";
});

async function verifyFetchFailed(server: Mockttp | string, dispatcher: Dispatcher, cause?: RegExp) {
	if (typeof server !== "string") {
		await server.forGet("/foobar").thenReply(200, "__RESPONSE_DATA__");
		server = server.urlFor("/foobar");
	}

	const promise = fetch(server, { dispatcher });

	await assert.rejects(promise, new TypeError("fetch failed"));
	if (cause) {
		const actualCause = await promise.catch((e: Error) => e.cause);
		assert.match((actualCause as Error).message, cause);
	}
}

async function verifyFetchSuccess(server: Mockttp, dispatcher: Dispatcher) {
	const mockedEndpoint = await server
		.forGet("/foobar")
		.thenReply(200, "__RESPONSE_DATA__");

	const r = await fetch(server.urlFor("/foobar"), { dispatcher });

	assert.strictEqual(await r.text(), "__RESPONSE_DATA__");
	return (await mockedEndpoint.getSeenRequests()).at(-1)!;
}

it("should throw error if proxy connect timeout", async () => {
	const blackHole = net.createServer();
	blackHole.listen();
	try {
		const addr = blackHole.address() as net.AddressInfo;

		const dispatcher = socksDispatcher({
			type: 5,
			host: addr.address,
			port: addr.port,
		}, {
			connect: { timeout: 500 },
		});

		await verifyFetchFailed(httpServer, dispatcher, /Proxy connection timed out/);
	} finally {
		blackHole.close();
	}
});

it("should throw error if the argument is invalid", async () => {
	// @ts-expect-error
	const dispatcher = socksDispatcher([null]);
	return verifyFetchFailed(httpServer, dispatcher, /Invalid SOCKS proxy details were provided/);
});

it("should throw error if the socks server is unreachable", () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: "::1",
		port: 111,
	});
	return verifyFetchFailed(httpServer, dispatcher, /connect ECONNREFUSED ::1:111/);
});

it("should throw error if authenticate failed", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: secureProxy.address,
		port: secureProxy.port,
		userId: "foo",
		password: "_INVALID_",
	});
	// The socks package missing handing of auth failed.
	return verifyFetchFailed(httpServer, dispatcher /* , message */);
});

it("should throw error if the target is unreachable", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});
	return verifyFetchFailed("http://[::1]:8964", dispatcher, /Socks5 proxy rejected connection/);
});

it("should connect directly if no proxies are provided", async () => {
	await verifyFetchSuccess(httpServer, socksDispatcher([]));
});

it("should connect target through socks", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});
	const inbound = await verifyFetchSuccess(httpServer, dispatcher);
	assert.strictEqual(inbound.remotePort, plainProxy.outbound.localPort);
});

it("should support proxy chain", async () => {
	const dispatcher = socksDispatcher([{
		type: 5,
		host: secureProxy.address,
		port: secureProxy.port,
		userId: "foo",
		password: "bar",
	}, {
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	}]);

	const inbound = await verifyFetchSuccess(httpServer, dispatcher);

	assert.strictEqual(inbound.remotePort, plainProxy.outbound.localPort);
	assert.strictEqual(plainProxy.inbound.remotePort, secureProxy.outbound.localPort);
});

it("should support TLS over socks", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	}, {
		connect: {
			rejectUnauthorized: false,
		},
	});
	const inbound = await verifyFetchSuccess(secureServer, dispatcher);
	assert.strictEqual(inbound.remotePort, plainProxy.outbound.localPort);
});

it("should do handshake on existing socket", async () => {
	const socksConnect = socksConnector({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});

	const dispatcher = new Agent({
		connect(options, callback) {
			const socket = net.connect(plainProxy.port, plainProxy.address);
			socksConnect({ ...options, httpSocket: socket }, callback);
		},
	});

	const inbound = await verifyFetchSuccess(httpServer, dispatcher);
	assert.strictEqual(inbound.remotePort, plainProxy.outbound.localPort);
});

it("should set the proxy globally", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});

	global[kGlobalDispatcher] = dispatcher;
	try {
		const inbound = await verifyFetchSuccess(httpServer, dispatcher);
		assert.strictEqual(inbound.remotePort, plainProxy.outbound.localPort);
	} finally {
		global[kGlobalDispatcher] = undefined;
	}
});

it("should proxy WebSocket", async () => {
	global[kGlobalDispatcher] = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});

	const ws = new WebSocket(`ws://localhost:${wsServer.port}`);
	try {
		await once(ws, "open");
		ws.send("Hello");
		const [response]: Array<MessageEvent<string>> = await once(ws, "message");

		assert.strictEqual(response.data, "Hello");
		assert.strictEqual(wsServer.inbound.remotePort, plainProxy.outbound.localPort);
	} finally {
		ws.close();
		global[kGlobalDispatcher] = undefined;
	}
});
