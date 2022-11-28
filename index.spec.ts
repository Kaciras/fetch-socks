import * as net from "net";
import { afterAll, afterEach, beforeEach, expect, it } from "@jest/globals";
import { createProxyServer, waitForConnect } from "@e9x/simple-socks";
import { getLocal, MockttpOptions } from "mockttp";
import { fetch } from "undici";
import { socksDispatcher } from "./index";

function setupHttpServer(options?: MockttpOptions) {
	const server = getLocal(options);
	beforeEach(() => server.start());
	afterEach(() => server.stop());
	return server;
}

function setupSocksServer(options: any = {}) {
	let inbound: net.Socket;
	let outbound: net.Socket;

	options.connect = async (port: number, host: string) => {
		outbound = net.connect(port, host);
		await waitForConnect(outbound);
		return outbound;
	};
	options.filter = (port: number, host: string, socket: net.Socket) => {
		inbound = socket;
		return Promise.resolve();
	};

	const server = createProxyServer(options);
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

const secureProxy = setupSocksServer({
	authenticate(username: string, password: string) {
		return username === "foo" && password === "bar"
			? Promise.resolve()
			: Promise.reject(new Error("Authenticate failed"));
	},
});

it("should throw error if the socks server is unreachable", async () => {
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: "::1",
			port: 111,
		},
	});
	await httpServer.forGet("/foobar").thenReply(200, "__RESPONSE_DATA__");

	const promise = fetch(httpServer.urlFor("/foobar"), { dispatcher });

	await expect(promise).rejects.toThrow(new TypeError("fetch failed"));
});

it("should throw error if the target is unreachable", async () => {
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: secureProxy.address,
			port: secureProxy.port,
			userId: "foo",
			password: "_INVALID_",
		},
	});
	await httpServer.forGet("/foobar").thenReply(200, "__RESPONSE_DATA__");
	const promise = fetch(httpServer.urlFor("/foobar"), { dispatcher });
	await expect(promise).rejects.toThrow(new TypeError("fetch failed"));
});

it("should throw error if authenticate failed", async () => {
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: plainProxy.address,
			port: plainProxy.port,
		},
	});
	const promise = fetch("http://[::1]:111", { dispatcher });
	await expect(promise).rejects.toThrow(new TypeError("fetch failed"));
});

it("should connect target through socks", async () => {
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: plainProxy.address,
			port: plainProxy.port,
		},
	});
	const ep = await httpServer.forGet("/foobar")
		.thenReply(200, "__RESPONSE_DATA__");

	const res = await fetch(httpServer.urlFor("/foobar"), { dispatcher });

	await expect(res.text()).resolves.toBe("__RESPONSE_DATA__");

	const [inbound] = await ep.getSeenRequests();
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
});

it("should support proxy chain", async () => {
	const dispatcher = socksDispatcher({
		proxy: [{
			type: 5,
			host: secureProxy.address,
			port: secureProxy.port,
			userId: "foo",
			password: "bar",
		}, {
			type: 5,
			host: plainProxy.address,
			port: plainProxy.port,
		}],
	});
	const ep = await httpServer.forGet("/foobar")
		.thenReply(200, "__RESPONSE_DATA__");

	const res = await fetch(httpServer.urlFor("/foobar"), { dispatcher });

	await expect(res.text()).resolves.toBe("__RESPONSE_DATA__");

	const [inbound] = await ep.getSeenRequests();
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);

	expect(plainProxy.inbound.remotePort).toBe(secureProxy.outbound.localPort);
});

it("should support TLS over socks", async () => {
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: plainProxy.address,
			port: plainProxy.port,
		},
		connect: {
			rejectUnauthorized: false,
		},
	});

	const ep = await secureServer.forGet("/foobar")
		.thenReply(200, "__TLS_RESPONSE_DATA__");

	const res = await fetch(secureServer.urlFor("/foobar"), { dispatcher });
	await expect(res.text()).resolves.toBe("__TLS_RESPONSE_DATA__");

	const [inbound] = await ep.getSeenRequests();
	expect(inbound.remotePort).toBe(plainProxy.outbound.localPort);
});
