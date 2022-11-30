# fetch-socks

[![npm package](https://img.shields.io/npm/v/fetch-socks.svg)](https://npmjs.com/package/fetch-socks)
[![Test](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml/badge.svg)](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Kaciras/fetch-socks/branch/master/graph/badge.svg?token=DJLSKIKYBJ)](https://codecov.io/gh/Kaciras/fetch-socks)

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

const response = await fetch("https://example.com", { dispatcher });
console.log(response.status);
console.log(await response.text());
```

fetch through proxy chain with two SOCKS proxies.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({
    proxy: [{
        type: 5,
        host: "::1",
        port: 1080,
    }, {
        type: 5,
        host: "::1",
        port: 1081,
        //userId: "foo",
        //password: "bar",
    }],
    // set some TLS options
    connect: {
        rejectUnauthorized: false,
    },
});

const response = await fetch("https://example.com", { dispatcher });
```
