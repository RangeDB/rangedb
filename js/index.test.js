// @ts-check

import { describe, it, mock } from 'node:test'
import { strictEqual, deepStrictEqual, rejects } from 'node:assert'
import { RangeDB } from './index.js'

const URL = 'https://rangedb.com/test.rangedb'

/**
 *
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
      // @ts-ignore
      strictEqual(db.url, URL)
      // @ts-ignore
      strictEqual(db.firstReadSize, 64 * 1024)
    })

    it('should initialize with custom options', () => {
      const db = new RangeDB(URL, {
        firstReadSize: 1024,
      })
      // @ts-ignore
      strictEqual(db.firstReadSize, 1024)
    })
  })

  describe('invalidate', () => {
    it('should reset header and index', () => {
      const db = new RangeDB(URL)
      // @ts-ignore
      db.header = { some: 'data' }
      // @ts-ignore
      db.index = new BigUint64Array(10).fill(7n)
      db.invalidate()
      // @ts-ignore
      strictEqual(db.header, null)
      // @ts-ignore
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
      // @ts-ignore
      strictEqual(db.etag, etag)
    })
    it('should invalidate header and index if ETag changed', async () => {
      const db = new RangeDB(URL)
      // @ts-ignore
      db.etag = 'old-etag'
      // @ts-ignore
      db.header = { some: 'data' }
      // @ts-ignore
      mockFetch(new ArrayBuffer(1), 'new-etag')

      await db.readRange(0, 0)
      // @ts-ignore
      strictEqual(db.header, null)
      // @ts-ignore
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
      // prettier-ignore
      const  {buffer} = new Uint8Array([
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
      // @ts-ignore
      db.index = new BigUint64Array([1n, 2n, 3n, 4n])
      const count = await db.getIndex()
      strictEqual(count, 2)
    })
    it('should fail on wrong index type', async () => {
      const db = new RangeDB(URL)
      // @ts-ignore
      db.header = {}
      const { buffer } = new Uint8Array(2)
      mockFetch(buffer)
      await rejects(async () => await db.getIndex(), {
        message: 'Unsuported index type: Expected 1 got 0',
      })
    })
    it('should read index', async () => {
      const db = new RangeDB(URL)
      // @ts-ignore
      db.header = {}

      // prettier-ignore
      const { buffer } = new Uint8Array([
        1, // indexType
        2, 0, 0, 0, // count
        0,0,0, // TODO: remove padding
        // key                    | offset
        100, 0, 0, 0, 0, 0, 0, 0,  50, 0, 0, 0, 0, 0, 0, 0,
        200, 0, 0, 0, 0, 0, 0, 0,  250, 0, 0, 0, 0, 0, 0, 0,
      ])

      mockFetch(buffer)
      const count = await db.getIndex()
      // @ts-ignore
      deepStrictEqual(db.index, new BigUint64Array([100n, 50n, 200n, 250n]))
      strictEqual(count, 2)
    })
  })

  describe('getMetadata', () => {
    it('should return cached metadata', async () => {
      const db = new RangeDB(URL)
      // @ts-ignore
      db.metadata = { key: 'value' }
      const metadata = await db.getMetadata()
      deepStrictEqual({ key: 'value' }, metadata)
    })
    it('should read metadata', async () => {
      const db = new RangeDB(URL)

      // @ts-ignore
      db.header = {}
      // prettier-ignore
      const { buffer } = new Uint8Array([
        0x7B, 0x22, 0x6B, 0x65, 0x79, 0x22, 0x3A, 0x22, 0x76, 0x61, 0x6C, 0x75, 0x65, 0x22, 0x7D
      ])

      mockFetch(buffer)

      const metadata = await db.getMetadata()
      deepStrictEqual({ key: 'value' }, metadata)
    })
  })
})
