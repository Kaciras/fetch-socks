# fetch-socks

[![npm package](https://img.shields.io/npm/v/fetch-socks.svg)](https://npmjs.com/package/fetch-socks)
[![Test](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml/badge.svg)](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Kaciras/fetch-socks/branch/master/graph/badge.svg?token=DJLSKIKYBJ)](https://codecov.io/gh/Kaciras/fetch-socks)
[![type-coverage](https://img.shields.io/badge/dynamic/json.svg?label=type-coverage&prefix=%E2%89%A5&suffix=%&query=$.typeCoverage.atLeast&uri=https%3A%2F%2Fraw.githubusercontent.com%2Fplantain-00%2Ftype-coverage%2Fmaster%2Fpackage.json)](https://github.com/plantain-00/type-coverage)

Socks proxy for Node builtin (also [undici](https://github.com/nodejs/undici)) `fetch`.

```shell
npm install fetch-socks
```

# Usage Examples

Fetch `http://example.com` through `socks5://[::1]:1080`.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({
    type: 5,
    host: "::1",
    port: 1080,

    //userId: "username",
    //password: "password",
});

const response = await fetch("http://example.com", { dispatcher });
console.log(response.status);
console.log(await response.text());
```

Set the proxy globally.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({ /* ... */});

global[Symbol.for("undici.globalDispatcher.1")] = dispatcher;
````

TypeScript example, fetch through proxy chain with two SOCKS proxies.

```typescript
import { fetch } from "undici";
import { socksDispatcher, SocksProxies } from "fetch-socks";

const proxyConfig: SocksProxies = [{
    type: 5,
    host: "::1",
    port: 1080,
}, {
    type: 5,
    host: "127.0.0.1",
    port: 1081,
}];

const dispatcher = socksDispatcher(proxyConfig, {
    connect: {
        // set some TLS options
        rejectUnauthorized: false,
    },
});

const response = await fetch("https://example.com", { dispatcher });
```

create a socks connection over HTTP tunnel with `socksConnector`.

```javascript
import { Client, Agent } from "undici";
import { socksConnector } from "fetch-socks";

const socksConnect = socksConnector({
    type: 5,
    host: "::1",
    port: 1080,
});

async function connect(options, callback) {
    // First establish a connection to the HTTP proxy server (localhost:80).
    const client = new Client("http://localhost:80");
    const { socket, statusCode } = await client.connect({
        // Tell the server to connect to the next ([::1]:1080)
        path: "[::1]:1080",
    });
    if (statusCode !== 200) {
        callback(new Error("Proxy response !== 200 when HTTP Tunneling"));
    } else {
        // Perform socks handshake on the connection.
        socksConnect({ ...options, httpSocket: socket }, callback);
    }
}

const dispatcher = new Agent({ connect });
const response = await fetch("https://example.com", { dispatcher });
```

# API

## `socksConnector(proxies, connectOptions?)`

Create an [Undici connector](https://undici.nodejs.org/#/docs/api/Connector) which establish the connection through socks proxies.

* `proxies` The proxy server to use or the list of proxy servers to chain. If you pass an empty array it will connect directly.
* `connectOptions` (optional) The options used to perform directly connect or TLS upgrade, see [here](https://undici.nodejs.org/#/docs/api/Connector?id=parameter-buildconnectorbuildoptions)

## `socksDispatcher(proxies, options?)`

Create a Undici Agent with socks connector.

* `proxies` Same as `socksConnector`'s.
* `options` (optional) [Agent options](https://undici.nodejs.org/#/docs/api/Agent). The `connect` property will be used to create socks connector.

```javascript
import { socksConnector, socksDispatcher } from "fetch-socks";
import { Agent } from "undici";

const proxy = { type: 5, host: "::1", port: 1080 };
const connect = { /* ... */ };
const agentOptions = { /* ... */ };

socksDispatcher(proxy, { ...agentOptions, connect });

// Is equivalent to
new Agent({ ...agentOptions, connect: socksConnector(proxy, connect) });
```
