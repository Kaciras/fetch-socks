import * as tls from "tls";
import { SocksClient, SocksProxy } from "socks";
import { buildConnector, Agent } from "undici";

type onEstablished = Parameters<typeof SocksClient.createConnection>[1];

function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

export function socksConnector(proxies: SocksProxy | SocksProxy[], tlsOptions?: any): buildConnector.connector {
	return async (options, callback) => {
		const { protocol, hostname, port } = options;

		const socksOptions = {
			command: "connect" as const,
			destination: {
				host: hostname,
				port: resolvePort(protocol, port as any),
			},
		};

		const onEstablished: onEstablished = (error, connection) => {
			if (error) {
				return callback(error, null);
			}
			let { socket } = connection!;
			socket.setNoDelay();

			if (protocol !== "https:") {
				return callback(null, socket);
			}

			socket = tls.connect({ ...tlsOptions, socket, servername: hostname });
			socket.on("error", error => callback(error, null))
				.on("secureConnect", () => callback(null, socket));
		};

		if (Array.isArray(proxies)) {
			// noinspection ES6MissingAwait
			SocksClient.createConnectionChain({ proxies, ...socksOptions }, onEstablished);
		} else {
			// noinspection ES6MissingAwait
			SocksClient.createConnection({ proxy: proxies, ...socksOptions }, onEstablished);
		}
	};
}

export interface SocksDispatcherOptions extends Agent.Options {
	proxy: SocksProxy | SocksProxy[];
}

export function socksDispatcher(options: SocksDispatcherOptions) {
	const { connect, proxy, ...rest } = options;
	return new Agent({ ...rest, connect: socksConnector(proxy, connect) });
}
