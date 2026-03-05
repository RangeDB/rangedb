// ts-check

import { deepStrictEqual, rejects, strictEqual } from 'node:assert'
import { describe, it, mock } from 'node:test'
import { RangeDB } from './index.js'

const URL = 'https://rangedb.com/test.rangedb'

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} etag
 * @returns
 */
const mockFetch = (arrayBuffer, etag = 'etag') =>
  mock.method(global, 'fetch', () =>
    Promise.resolve({
      headers: {
        get: () => etag,
      },
      arrayBuffer: () => Promise.resolve(arrayBuffer),
    }),
  )

describe('RangeDB', () => {
  describe('constructor', () => {
    it('should initialize with url and default options', () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      strictEqual(db.url, URL)
      // @ts-expect-error
      strictEqual(db.firstReadSize, 64 * 1024)
    })

    it('should initialize with custom options', () => {
      const db = new RangeDB(URL, {
        firstReadSize: 1024,
      })
      // @ts-expect-error
      strictEqual(db.firstReadSize, 1024)
    })
  })

  describe('invalidate', () => {
    it('should reset header and index', () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = { some: 'data' }
      // @ts-expect-error
      db.index = new BigUint64Array(10).fill(7n)
      db.invalidate()
      // @ts-expect-error
      strictEqual(db.header, null)
      // @ts-expect-error
      strictEqual(db.index, null)
    })
  })

  describe('readRange', () => {
    it('should perform HTTP range request and return ArrayBuffer', async () => {
      const db = new RangeDB(URL)
      const expectedBuffer = new ArrayBuffer(10)
      const etag = 'etag'
      mockFetch(expectedBuffer, etag)

      const result = await db.readRange(0, 9)
      strictEqual(result, expectedBuffer)
      // @ts-expect-error
      strictEqual(db.etag, etag)
    })
    it('should invalidate header and index if ETag changed', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.etag = 'old-etag'
      // @ts-expect-error
      db.header = { some: 'data' }
      mockFetch(new ArrayBuffer(1), 'new-etag')

      await db.readRange(0, 0)
      // @ts-expect-error
      strictEqual(db.header, null)
      // @ts-expect-error
      strictEqual(db.index, null)
    })
  })

  describe('getHeader', () => {
    it('should fail on not rangedb file', async () => {
      const db = new RangeDB(URL)
      const { buffer } = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ])

      mockFetch(buffer)

      await rejects(async () => await db.getHeader(), {
        message:
          'Invalid Magic Number: Expected file starting with "RangeDB" or [0x52\t0x61\t0x6E\t0x67\t0x65\t0x44\t0x42]',
      })
    })
    it('should fail on wrong spec version', async () => {
      const db = new RangeDB(URL)
      const { buffer } = new Uint8Array([
        0x52, 0x61, 0x6e, 0x67, 0x65, 0x44, 0x42, 0x02,
      ])

      mockFetch(buffer)

      await rejects(async () => await db.getHeader(), {
        message: 'Unsupported spec version. Expected 1 got 2',
      })
    })
    it('should read header', async () => {
      const db = new RangeDB(URL)
      // biome-ignore format: easier to read
      const { buffer } = new Uint8Array([
        0x52, 0x61, 0x6e, 0x67, 0x65, 0x44, 0x42, // magic 'RangeDB'
        1, // specVersion
        35, 0, 0, 0, // metadataOffset
        100, 0, 0, 0, // metadataLength
        135, 0, 0, 0, // indexOffset
        200, 0, 0, 0, // indexLength
        250, 0, 0, 0, 0, 0, 0, 0, // dataOffset
        251, 0, 0, 0, 0, 0, 0, 0, // dataLength
        1, // compression
        2, // contentType
      ])

      mockFetch(buffer, 'new-etag')

      const header = await db.getHeader()
      const expectedHeader = {
        specVersion: 1,
        metadataOffset: 35,
        metadataLength: 100,
        indexOffset: 135,
        indexLength: 200,
        dataOffset: 250n,
        dataLength: 251n,
        compression: 1,
        contentType: 2,
      }
      deepStrictEqual(header, expectedHeader)
    })
  })

  describe('getIndex', () => {
    it('should return cached index', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.index = new BigUint64Array([1n, 2n, 3n, 4n])
      const count = await db.getIndex()
      strictEqual(count, 2)
    })
    it('should fail on wrong index type', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = {
        indexOffset: 200,
        indexLength: 100,
      }
      const { buffer } = new Uint8Array(2)
      mockFetch(buffer)
      await rejects(async () => await db.getIndex(), {
        message: 'Unsuported index type: Expected 1 got 0',
      })
    })
    it('should read index', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = {
        indexOffset: 200,
        indexLength: 100,
      }
      // biome-ignore format: easier to read
      const { buffer } = new Uint8Array([
        1,          // indexType
        2, 0, 0, 0, // count
        0,0,0,      // TODO: remove padding
        // key                    | offset
        100, 0, 0, 0, 0, 0, 0, 0,  50, 0, 0, 0, 0, 0, 0, 0,
        200, 0, 0, 0, 0, 0, 0, 0,  250, 0, 0, 0, 0, 0, 0, 0,
      ])

      mockFetch(buffer)
      const count = await db.getIndex()
      // @ts-expect-error
      deepStrictEqual(db.index, new BigUint64Array([100n, 50n, 200n, 250n]))
      strictEqual(count, 2)
    })
  })

  describe('getMetadata', () => {
    it('should return cached metadata', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.metadata = { key: 'value' }
      const metadata = await db.getMetadata()
      deepStrictEqual({ key: 'value' }, metadata)
    })
    it('should read metadata', async () => {
      const db = new RangeDB(URL)

      // @ts-expect-error
      db.header = {
        metadataOffset: 200,
        metadataLength: 100,
      }
      const { buffer } = new Uint8Array([
        0x7b, 0x22, 0x6b, 0x65, 0x79, 0x22, 0x3a, 0x22, 0x76, 0x61, 0x6c, 0x75,
        0x65, 0x22, 0x7d,
      ])

      mockFetch(buffer)

      const metadata = await db.getMetadata()
      deepStrictEqual({ key: 'value' }, metadata)
    })
  })

  describe('findInChunk', () => {
    it('should find key in chunk or not', () => {
      const { findInChunk } = RangeDB
      // biome-ignore format: easier to read
      const { buffer } = new Uint8Array([
        // [key                      | length     | value]
            10, 0, 0, 0, 0, 0, 0, 0,  1, 0, 0, 0,  1,
            20, 0, 0, 0, 0, 0, 0, 0,  1, 0, 0, 0,  2,
            50, 0, 0, 0, 0, 0, 0, 0,  1, 0, 0, 0,  5,
            90, 0, 0, 0, 0, 0, 0, 0,  1, 0, 0, 0,  9,
      ])
      deepStrictEqual(findInChunk(0n, buffer), null)
      deepStrictEqual(findInChunk(99n, buffer), null)
      deepStrictEqual(findInChunk(10n, buffer), new Uint8Array([1]).buffer)
      deepStrictEqual(findInChunk(20n, buffer), new Uint8Array([2]).buffer)
      deepStrictEqual(findInChunk(50n, buffer), new Uint8Array([5]).buffer)
      deepStrictEqual(findInChunk(90n, buffer), new Uint8Array([9]).buffer)
    })
  })

  describe('binarySearch', () => {
    it('should find key in index or not', () => {
      const { binarySearch: b } = RangeDB
      // biome-ignore format: easier to read
      const a = new BigUint64Array([
        100n, 1000n,
        200n, 2000n,
        300n, 3000n,
      ])
      deepStrictEqual(b(1n, a, 1000n), null)
      deepStrictEqual(b(100n, a, 10000n), { start: 1000n, end: 2000n })
      deepStrictEqual(b(150n, a, 10000n), { start: 1000n, end: 2000n })
      deepStrictEqual(b(200n, a, 10000n), { start: 2000n, end: 3000n })
      deepStrictEqual(b(300n, a, 10000n), { start: 3000n, end: 10000n })
      deepStrictEqual(b(301n, a, 10000n), { start: 3000n, end: 10000n })
    })
  })

  describe('getRaw', () => {
    it('should return null for non-existent key', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = {
        dataOffset: 1000n,
        dataLength: 100n,
      }
      // @ts-expect-error
      db.index = new BigUint64Array([100n, 1000n, 200n, 1100n])

      const result = await db.getRaw(50n)
      strictEqual(result, null)
    })

    it('should return ArrayBuffer for existing key', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = {
        dataOffset: 1000n,
        dataLength: 100n,
      }
      // @ts-expect-error
      db.index = new BigUint64Array([100n, 1000n, 200n, 1100n])

      // biome-ignore format: easier to read
      const chunk = new Uint8Array([
        100, 0, 0, 0, 0, 0, 0, 0,  // key 100n
        3, 0, 0, 0,                  // length 3
        1, 2, 3,                      // data
      ])

      mockFetch(chunk.buffer)

      const result = await db.getRaw(100n)
      deepStrictEqual(result, new Uint8Array([1, 2, 3]).buffer)
    })

    it('should load index if not cached', async () => {
      const db = new RangeDB(URL)
      // @ts-expect-error
      db.header = {
        dataOffset: 1000n,
        dataLength: 100n,
        indexOffset: 200,
        indexLength: 100,
      }
      // biome-ignore format: easier to read
      const index = new Uint8Array([
        1,                          // indexType
        1, 0, 0, 0,                 // count 1
        0, 0, 0,                    // padding
        100, 0, 0, 0, 0, 0, 0, 0,   // key
        232, 3, 0, 0, 0, 0, 0, 0,   // offset
      ])

      // biome-ignore format: easier to read
      const chunk = new Uint8Array([
        100, 0, 0, 0, 0, 0, 0, 0, // key
        1, 0, 0, 0,               // length
        42,                       // data
      ])

      let callCount = 0
      mock.method(global, 'fetch', () => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            headers: { get: () => 'etag' },
            arrayBuffer: () => Promise.resolve(index.buffer),
          })
        } else {
          return Promise.resolve({
            headers: { get: () => 'etag' },
            arrayBuffer: () => Promise.resolve(chunk.buffer),
          })
        }
      })

      const result = await db.getRaw(100n)
      deepStrictEqual(result, new Uint8Array([42]).buffer)
    })
  })

  describe('getJson', () => {
    it('should return parsed JSON for valid data', async () => {
      const db = new RangeDB(URL)
      const jsonData = { key: 'value', number: 42 }
      const jsonString = JSON.stringify(jsonData)
      const buffer = new TextEncoder().encode(jsonString).buffer

      mock.method(db, 'getRaw', () => Promise.resolve(buffer))

      const result = await db.getJson(100n)
      deepStrictEqual(result, jsonData)
    })

    it('should return null if getRaw returns null', async () => {
      const db = new RangeDB(URL)

      mock.method(db, 'getRaw', () => Promise.resolve(null))

      const result = await db.getJson(100n)
      strictEqual(result, null)
    })

    it('should throw SyntaxError for invalid JSON', async () => {
      const db = new RangeDB(URL)
      const invalidJson = '{ invalid json }'
      const buffer = new TextEncoder().encode(invalidJson).buffer

      mock.method(db, 'getRaw', () => Promise.resolve(buffer))

      await rejects(async () => await db.getJson(100n), SyntaxError)
    })
  })
})
