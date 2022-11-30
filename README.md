# fetch-socks

[![npm package](https://img.shields.io/npm/v/fetch-socks.svg)](https://npmjs.com/package/fetch-socks)
[![Test](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml/badge.svg)](https://github.com/Kaciras/fetch-socks/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Kaciras/fetch-socks/branch/master/graph/badge.svg?token=DJLSKIKYBJ)](https://codecov.io/gh/Kaciras/fetch-socks)

Socks proxy for Node builtin (also [undici](https://github.com/nodejs/undici)) `fetch`.

```shell
npm install fetch-socks
```

# Usage Examples

fetch `http://example.com` through `socks5://[::1]:1080`.

```javascript
import { socksDispatcher } from "fetch-socks";

const dispatcher = socksDispatcher({
    type: 5,
    host: "::1",
    port: 1080,
});

const response = await fetch("https://example.com", { dispatcher });
console.log(response.status);
console.log(await response.text());
```

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
    //userId: "foo",
    //password: "bar",
}];

const dispatcher = socksDispatcher(proxyConfig, {
    connect: {
        // set some TLS options
        rejectUnauthorized: false,
    },
});

const response = await fetch("https://example.com", { dispatcher });
```
