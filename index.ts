import tls from "tls";
import { buildConnector } from "undici";
import { SocksClient } from "socks";

function resolvePort(protocol: string, port: string) {
	return port ? Number.parseInt(port) : protocol === "http:" ? 80 : 443;
}

export function socksConnector(
	socksHost: string,
	socksPort: number,
	version: 4 | 5,
	tlsOptions?: any,
): buildConnector.connector {
	return async (options, callback) => {
		const { protocol, hostname, port } = options;
		SocksClient.createConnection({
			proxy: {
				host: socksHost,
				port: socksPort,
				type: version,
			},
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
