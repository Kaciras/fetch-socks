const createConnectionChain = jest.fn();

jest.mock("socks", () => ({
	SocksClient: { createConnectionChain },
}));

import { Socket } from "net";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { getLocal, Mockttp } from "mockttp";
import { fetch } from "undici";
import { socksDispatcher } from "./index";

const httpServer = getLocal();
beforeEach(async () => {
	await httpServer.start();
	await httpServer.forGet("/foobar").thenReply(200, "__RESPONSE_DATA__");
});
afterEach(() => httpServer.stop());

const secureServer = getLocal({
	https: {
		keyPath: "fixtures/localhost.pvk",
		certPath: "fixtures/localhost.pem",
	},
});

beforeEach(async () => {
	await secureServer.start();
	await secureServer.forGet("/foobar")
		.withProtocol("https")
		.thenReply(200, "__RESPONSE_DATA__");
});
afterEach(() => secureServer.stop());

function setupSocksTarget(dest: Mockttp | Error) {
	createConnectionChain.mockImplementation((_, callback: any) => {
		if (dest instanceof Error) {
			return callback(dest);
		}
		const socket = new Socket();
		socket.connect(dest.port);
		callback(null, { socket });
	});
}

it("should connect target through socks", async () => {
	setupSocksTarget(httpServer);
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: "::1",
			port: 1080,
		},
	});
	await fetch("http://example.com/foobar", { dispatcher });

	expect(createConnectionChain.mock.calls).toHaveLength(1);

	const [options] = createConnectionChain.mock.calls[0];
	expect(options).toStrictEqual({
		proxies: [{ host: "::1", port: 1080, type: 5 }],
		command: "connect",
		destination: { host: "example.com", port: 80 },
	});
});

it("should pass parameters to socks proxy", async () => {
	setupSocksTarget(secureServer);
	const dispatcher = socksDispatcher({
		proxy: {
			type: 4,
			host: "::1",
			port: 1080,
		},
		connect: {
			rejectUnauthorized: false,
		},
	});

	await fetch("https://example.com/foobar", { dispatcher });

	const [options] = createConnectionChain.mock.calls[0];
	expect(options).toStrictEqual({
		proxies: [{ host: "::1", port: 1080, type: 4 }],
		command: "connect",
		destination: { host: "example.com", port: 443 },
	});
});

it("should support TLS over socks", async () => {
	setupSocksTarget(secureServer);
	const dispatcher = socksDispatcher({
		proxy: {
			type: 5,
			host: "::1",
			port: 1080,
		},
		connect: {
			rejectUnauthorized: false,
		},
	});

	const res = await fetch("https://example.com/foobar", { dispatcher });
	await expect(res.text()).resolves.toBe("__RESPONSE_DATA__");
});
