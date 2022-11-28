# fetch-socks

[![npm package](https://img.shields.io/npm/v/fetch-socks.svg)](https://npmjs.com/package/fetch-socks)
[![Test](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml/badge.svg)](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml)

Socks proxy for Node builtin (also [undici](https://github.com/nodejs/undici)) `fetch`.

```shell
npm install fetch-socks
```

# Usage Example

fetch `http://example.com` through `socks5://[::1]:1080`.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({
	proxy: {
		type: 5,
		host: "::1",
		port: 1080,
	},
});

const response = await fetch("http://example.com", { dispatcher });
console.log(response.status);
console.log(await response.text());
```

fetch through proxy chain with two SOCKS proxies.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({
	proxy: [
		{
			type: 5,
			host: "::1",
			port: 1080,
		},
		{
			type: 5,
			host: "::1",
			port: 1081,
			//userId: "foo",
			//password: "bar",
		},
    ],
});

const response = await fetch("http://example.com", { dispatcher });
```
