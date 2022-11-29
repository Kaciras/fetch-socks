import { SocksClient, SocksProxy } from "socks";
import { Agent, buildConnector } from "undici";
import Connector = buildConnector.connector;

type onEstablished = Parameters<typeof SocksClient.createConnection>[1];

function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

export function socksConnector(proxies: SocksProxy | SocksProxy[], buildOpts: any = {}): Connector {
	const { timeout = 10e3 } = buildOpts;
	const tlsUpgrade = buildConnector(buildOpts);

	return async (options, callback) => {
		const { protocol, hostname, port } = options;

		const socksOptions = {
			command: "connect" as const,
			timeout,
			destination: {
				host: hostname,
				port: resolvePort(protocol, port as any),
			},
		};

		const onEstablished: onEstablished = (error, connection) => {
			if (error) {
				return callback(error, null);
			}
			const { socket } = connection!;

			if (protocol !== "https:") {
				return callback(null, socket.setNoDelay());
			}
			return tlsUpgrade({ ...options, httpSocket: socket } as any, callback);
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
