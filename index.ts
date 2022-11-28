import * as tls from "tls";
import { SocksClient, SocksProxy } from "socks";
import { buildConnector, Agent } from "undici";

function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

export function socksConnector(
	socks: SocksProxy | SocksProxy[],
	tlsOptions?: any,
): buildConnector.connector {
	const proxies = Array.isArray(socks) ? socks : [socks];

	return async (options, callback) => {
		const { protocol, hostname, port } = options;

		// noinspection ES6MissingAwait
		SocksClient.createConnectionChain({
			proxies,
			command: "connect",
			destination: {
				host: hostname,
				port: resolvePort(protocol, port as any),
			},
		}, (error, connection) => {
			if (error) {
				return callback(error, null);
			}
			let { socket } = connection!;

			let connectEvent = "connect";
			if (protocol === "https:") {
				socket = tls.connect({
					...tlsOptions,
					socket,
					servername: hostname,
				});
				connectEvent = "secureConnect";
			}

			socket
				.on("error", error => callback(error, null))
				.on(connectEvent, () => callback(null, socket));
		});
	};
}

interface SocksDispatcherOptions extends Agent.Options {
	proxy: SocksProxy | SocksProxy[];
}

export function socksDispatcher(options: SocksDispatcherOptions) {
	const { connect, proxy, ...rest } = options;
	return new Agent({ ...rest, connect: socksConnector(proxy, connect) });
}
