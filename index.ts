import * as tls from "tls";
import { SocksClient, SocksProxy } from "socks";
import { buildConnector, Agent } from "undici";

function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

export function socksConnector(proxy: SocksProxy, tlsOptions?: any): buildConnector.connector {
	return async (options, callback) => {
		const { protocol, hostname, port } = options;
		SocksClient.createConnection({
			proxy,
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
	proxy: SocksProxy;
}

export function socksDispatcher(options: SocksDispatcherOptions) {
	const { connect, proxy, ...rest } = options;
	return new Agent({ ...rest, connect: socksConnector(proxy, connect) });
}
