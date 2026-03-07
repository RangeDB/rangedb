// @ts-check

import { RangeDB } from '@rangedb/js'

export class RangeDBCloudflare extends RangeDB {
  /**
   * Initialize database by providing Cloudflare R2 bucket and file name.
   *
   * @param {R2Bucket} bucket Cloudflare R2 Bucket binding
   * @param {string} key Name of the file in the bucket
   * @param {import('@rangedb/js').RangeDBOptions} [options]
   */
  constructor(bucket, key, options = {}) {
    super(key, options)
    /** @private @type {R2Bucket} */
    this.bucket = bucket
    /** @private @type {string} */
    this.key = key
  }

  /**
   * Perform range read on file in Cloudflare R2 bucket.
   *
   * @protected
   * @param {bigint} start
   * @param {bigint} end
   *
   * @returns {Promise<ArrayBuffer>}
   */
  async readRange(start, end) {
    const length = Number(end - start) + 1

    const object = await this.bucket.get(this.key, {
      range: {
        offset: Number(start),
        length: length,
      },
    })

    if (object === null) {
      throw new Error(
        `Database file not found. Key ${this.key} not found in bucket.`,
      )
    }

    const { etag } = object
    if (this.etag && this.etag !== etag) {
      this.invalidate()
      throw new Error('Database file has changed based on ETag.')
    }
    this.etag = etag

    return object.arrayBuffer()
  }
}
