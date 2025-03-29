# @keyv/nats-kv [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> NATS Key-Value storage adapter for [Keyv](https://github.com/jaredwray/keyv)

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/nats-kv)](https://npmjs.com/package/@keyv/nats-kv)

## Install

```shell
npm install --save @keyv/nats-kv
```

## Usage

```js
import Keyv from "keyv";
import { KeyvNatsKV } from "@keyv/nats-kv";

// Basic usage with NATS server at nats://localhost:4222
const store = new KeyvNatsKV({
  bucket: "my-keyv-bucket",
});
const keyv = new Keyv({ store });

// Set a value (with optional expiry)
await keyv.set("foo", "bar", 6000); // Expiring time in milliseconds is optional

// Get a value
const value = await keyv.get("foo");

// Delete a value
await keyv.delete("foo");

// Clear all values in the namespace
await keyv.clear();
```

## Configuration Options

```js
import Keyv from "keyv";
import { KeyvNatsKV } from "@keyv/nats-kv";

// Full options
const store = new KeyvNatsKV({
  // Connection options
  servers: "nats://localhost:4222", // or an array of servers

  // NATS KV bucket name (required)
  bucket: "my-keyv-bucket",

  // Optional default TTL in milliseconds
  ttl: 60000, // 1 minute

  // Optional namespace prefix for keys
  namespace: "my-app",

  // Optional number of replicas for high availability
  replicas: 3,

  // Reuse an existing NATS connection
  connection: existingNatsConnection,
});

const keyv = new Keyv({ store });
```

## Usage with Namespaces

```js
import Keyv from "keyv";
import { KeyvNatsKV } from "@keyv/nats-kv";

const store = new KeyvNatsKV({
  bucket: "my-keyv-bucket",
});

// Create different namespaces using the same store
const keyv1 = new Keyv({ store, namespace: "namespace1" });
const keyv2 = new Keyv({ store, namespace: "namespace2" });

// Set values in different namespaces
await keyv1.set("foo", "bar1");
await keyv2.set("foo", "bar2");

// Get values from specific namespaces
const value1 = await keyv1.get("foo"); // returns 'bar1'
const value2 = await keyv2.get("foo"); // returns 'bar2'
```

## Requirements

- NATS server v2.2.0 or later with JetStream enabled
- Node.js 14 or later

## License

[MIT © Jared Wray](LICENSE)
