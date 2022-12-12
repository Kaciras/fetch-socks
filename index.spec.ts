import * as net from "net";
import { afterAll, afterEach, beforeEach, expect, it } from "@jest/globals";
import { createProxyServer, waitForConnect } from "@e9x/simple-socks";
import { getLocal, Mockttp, MockttpOptions } from "mockttp";
import { Agent, Dispatcher, fetch } from "undici";
import { socksConnector, socksDispatcher } from "./index";

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
			return Promise.resolve();
		},
	});

	server.listen();
	afterAll(() => void server.close());

	return {
		get inbound() { return inbound; },
		get outbound() { return outbound; },
		...server.address() as net.AddressInfo,
	};
}

const httpServer = setupHttpServer();

const secureServer = setupHttpServer({
	https: {
		keyPath: "fixtures/localhost.pvk",
		certPath: "fixtures/localhost.pem",
	},
});

const plainProxy = setupSocksServer();

const secureProxy = setupSocksServer((username, password) => {
	return username === "foo" && password === "bar"
		? Promise.resolve()
		: Promise.reject(new Error("Authenticate failed"));
});

async function verifyFetchFailed(server: Mockttp | string, dispatcher: Dispatcher, cause?: unknown) {
	if (typeof server !== "string") {
		await server.forGet("/foobar").thenReply(200, "__RESPONSE_DATA__");
		server = server.urlFor("/foobar");
	}

	const promise = fetch(server, { dispatcher });

	await expect(promise).rejects.toThrow(new TypeError("fetch failed"));
	await expect(promise.catch(e => { throw e.cause; })).rejects.toThrow(cause);
}

async function verifyFetchSuccess(server: Mockttp, dispatcher: Dispatcher) {
	const mockedEndpoint = await server
		.forGet("/foobar")
		.thenReply(200, "__RESPONSE_DATA__");

	const r = await fetch(server.urlFor("/foobar"), { dispatcher });

	await expect(r.text()).resolves.toBe("__RESPONSE_DATA__");
	return (await mockedEndpoint.getSeenRequests()).at(-1)!;
}

it("should throw error if proxy connect timeout", async () => {
	const blackHole = net.createServer();
	blackHole.listen();
	const addr = blackHole.address() as net.AddressInfo;

	const dispatcher = socksDispatcher({
		type: 5,
		host: addr.address,
		port: addr.port,
	}, {
		connect: { timeout: 500 },
	});

	await verifyFetchFailed(httpServer, dispatcher, "Proxy connection timed out");

	blackHole.close();
});

it("should throw error if the argument is invalid", async () => {
	// @ts-expect-error
	const dispatcher = socksDispatcher([null]);
	return verifyFetchFailed(httpServer, dispatcher, "Invalid SOCKS proxy details were provided.");
});

it("should throw error if the socks server is unreachable", () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: "::1",
		port: 111,
	});
	return verifyFetchFailed(httpServer, dispatcher, "connect ECONNREFUSED ::1:111");
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

it("should connect directly if no proxies are provided", () => {
	return verifyFetchSuccess(httpServer, socksDispatcher([]));
});

it("should connect target through socks", async () => {
	const dispatcher = socksDispatcher({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});
	const inbound = await verifyFetchSuccess(httpServer, dispatcher);
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
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

	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
	expect(plainProxy.inbound.remotePort).toBe(secureProxy.outbound.localPort);
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
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
});

it("should do handshake on existing socket", async () => {
	const socksConnect = socksConnector({
		type: 5,
		host: plainProxy.address,
		port: plainProxy.port,
	});

	function connect(options: any, callback: any) {
		const socket = net.connect(plainProxy.port, plainProxy.address);
		socksConnect({ ...options, httpSocket: socket }, callback);
	}

	const dispatcher = new Agent({ connect });

	const inbound = await verifyFetchSuccess(httpServer, dispatcher);
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
}); 
