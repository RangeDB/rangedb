// @ts-check

import { equal, rejects } from 'node:assert'
import { describe, it } from 'node:test'
import { RangeDBCloudflare } from './index.js'

describe('RangeDBCloudflare', () => {
  it('should read range from R2 bucket', async () => {
    const name = 'test.rangedb'
    const mockBucket = {
      /**
       * @param {string} key
       * @param {{ range: { offset: bigint; length: bigint } }} options
       */
      async get(key, { range }) {
        equal(key, name)
        const { offset, length } = range
        equal(offset, 100)
        equal(length, 20)
        return {
          etag: 'mock-etag',
          arrayBuffer: () => Promise.resolve(Buffer.alloc(0)),
        }
      },
    }

    const db = new RangeDBCloudflare(mockBucket, name)

    // @ts-expect-error protected
    await db.readRange(100n, 119n)
    // @ts-expect-error protected
    equal(db.etag, 'mock-etag')
  })

  it('should throw an error if file not found in R2 bucket', async () => {
    const mockBucket = {
      async get() {
        return null
      },
    }

    const db = new RangeDBCloudflare(mockBucket, 'missing.rangedb')

    // @ts-expect-error protected
    await rejects(() => db.readRange(0n, 10n), {
      message: /Database file not found. Key missing.rangedb not found in bucket./,
    })
  })

  it('should throw an error if ETag change', async () => {
    const mockBucket = {
      get: () => ({
        etag: 'mock-etag',
        arrayBuffer: () => Promise.resolve(Buffer.alloc(0)),
      }),
    }

    const db = new RangeDBCloudflare(mockBucket, 'test.rangedb')
    // @ts-expect-error protected
    db.etag = 'old-etag'

    // @ts-expect-error protected
    await rejects(() => db.readRange(100n, 119n), {
      message: /Database file has changed based on ETag./,
    })
  })
})
