import { SocksClient, SocksProxy } from "socks";
import { Agent, buildConnector } from "undici";
import Connector = buildConnector.connector;
import TLSOptions = buildConnector.BuildOptions;

type onEstablished = Parameters<typeof SocksClient.createConnection>[1];

export type SocksProxies = SocksProxy | SocksProxy[];

/**
 * Since socks does not guess HTTP ports, we need to do that.
 *
 * @param protocol Upper layer protocol, "http:" or "https:"
 * @param port A string containing the port number of the URL, maybe empty.
 */
function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

/**
 * Create an undici connector which establish the connection through socks proxies.
 *
 * @param proxies The proxy server to use or the list of proxy servers to chain.
 * @param tlsOpts TLS upgrade options.
 */
export function socksConnector(proxies: SocksProxies, tlsOpts: TLSOptions = {}): Connector {
	const { timeout = 10e3 } = tlsOpts;
	const tlsUpgrade = buildConnector(tlsOpts);

	return async (options, callback) => {
		const { protocol, hostname, port } = options;

		const socksOptions = {
			command: "connect" as const,
			timeout,
			destination: {
				host: hostname,
				port: resolvePort(protocol, port),
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
			return tlsUpgrade({ ...options, httpSocket: socket }, callback);
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

	/**
	 * TLS upgrade options, see:
	 * https://undici.nodejs.org/#/docs/api/Client?id=parameter-connectoptions
	 *
	 * The connect function is not supported.
	 * If you want to create a custom connector, you can use `socksConnector`.
	 */
	connect?: TLSOptions;
}

/**
 * Create a undici Agent with socks connector.
 *
 * @param proxies The proxy server to use or the list of proxy servers to chain.
 * @param options Additional options passed to the Agent constructor.
 */
export function socksDispatcher(proxies: SocksProxies, options: SocksDispatcherOptions = {}) {
	const { connect, ...rest } = options;
	return new Agent({ ...rest, connect: socksConnector(proxies, connect) });
}
