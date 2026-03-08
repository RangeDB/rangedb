# RangeDB

Read-only key/value database for storing large datasets super cheap on S3-like hosting.

## Problem

What used to be a small database grows over time. Storage requirements increase and with them cost. Most of the records are historical and either it cannot be changed or change rarely.

It would be great just to export those read only records and store it safely on a cheap cloud storage as SQL dump or CSV. But those are impossible to query. This will not work and database grow and grow.

Introducing RangeDB. RangeDB is a storage format that allows query record by it's ID from cloud storage using simple HTTP [range header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range).

## Implementations

### JS

Main implementation of database client in Javascript. Small footprint of 5kb(3kb minified).

#### Install

```sh
npm install @rangedb/js
yarn add @rangedb/js
```

#### Usage

```js
import { RangeDB } from '@rangedb/js'

const db = RangeDB('https://rangedb.github.io/rangedb/cities.rangedb')
const { name, country } = await db.getJson(1000)

console.log(name, country) // Bratislava SK
```

### NodeJS

Extended implementation of _@rangedb/js_. In addition it can also open rangedb as a file.

#### Install

```sh
npm install @rangedb/nodejs
yarn add @rangedb/nodejs
```

#### Usage

```js
import { RangeDB } from '@rangedb/nodejs'

const db = RangeDB('./cities.rangedb')
const { name, country } = await db.getJson(2000)

console.log(name, country) // Bergen NO
```

### Cloudflare

For usage in Cloudflare worker. Cloudflare pricing model is perfect for RangeDB as reads are free. One only pays for transfered data.

#### Install

```sh
npm install @rangedb/cloudflare
yarn add @rangedb/cloudflare
```

#### Usage

```js
import { RangeDB } from '@rangedb/js'

const db = RangeDB(env.MY_BUCKET, 'cities.rangedb')
const { name, country } = await db.getJson(3000)

console.log(name, country) // Praha CZ
```
