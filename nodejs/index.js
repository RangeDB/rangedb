// @ts-check

import { createWriteStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { RangeDB } from '@rangedb/js'

export const VERSION = 1

/**
 * @typedef {Object} BuilderOptions
 *
 * @property {Object} [metadata]
 * Arbitrary metadata for database as a JSON.
 *
 * @property {number} [chunkSize]
 * Number of records in one chunk. How many records can share one entry in index.
 * More items in chunk smaller the index is but more is fetched for a single get query.
 */

export class RangeDBBuilder {
  /**
   *
   * @param {string} filePath
   * @param {BuilderOptions} options
   */
  constructor(filePath, options = {}) {
    /** @private @type {string} */
    this.filePath = filePath

    /** @private @type {import('node:fs').WriteStream | null}  */
    this.writter = createWriteStream(filePath)

    /** @private @type {number}  */
    this.chunkSize = options.chunkSize ?? 1

    /** @private @type {bigint} */
    this.lastKey = null

    /** @private @type {bigint[]} */
    this.index = []

    /** @private @type {number} */
    this.records = 0

    /** @private @type {bigint} */
    this.offset = 0n

    /** @private @type {bigint} */
    this.dataOffset = 0n

    /** @private @type {bigint} */
    this.dataLength = 0n

    const metadata = Buffer.from(JSON.stringify(options.metadata ?? null))

    const header = Buffer.alloc(60)
    header.write('RangeDB', 0, 7, 'ascii') // Magic number
    header.writeUint8(VERSION, 7)
    header.writeBigUInt64LE(BigInt(header.length), 8) // metadata offset
    header.writeUint32LE(metadata.length, 16) // metadata length
    header.writeBigUInt64LE(0n, 20) // index offset
    header.writeUInt32LE(0, 28) // index length
    header.writeBigUInt64LE(0n, 32) // data offset
    header.writeBigUInt64LE(0n, 40) // data length
    header.writeUInt8(0, 48) // compression
    header.writeUInt8(0, 49) // contentType

    this.writter.write(header)
    this.offset += BigInt(header.length)
    this.writter.write(metadata)
    this.offset += BigInt(metadata.length)
    this.dataOffset = this.offset
  }

  /**
   * Add record into database file
   *
   * @param {bigint} key
   * @param {ArrayBuffer} data
   *
   * @returns {Promise<void>}
   * @throws Error if record key are not in increasing orders
   */
  async addRecord(key, data) {
    if (this.lastKey !== null && this.lastKey > key) {
      throw new Error(
        `Records must be added in increasing order. Current key ${key} is not bigger than previous key ${this.lastKey}`,
      )
    }
    this.lastKey = key

    const recordLength = 8n + 4n + BigInt(data.byteLength)
    const record = Buffer.alloc(12)
    record.writeBigUint64LE(key, 0)
    record.writeUint32LE(data.byteLength, 8)
    const fine = this.writter.write(record) && this.writter.write(data)

    if (this.records % this.chunkSize === 0) {
      this.index.push(key, this.offset)
    }
    this.offset += recordLength
    this.dataLength += recordLength
    this.records++

    if (!fine) {
      await new Promise((resolve) => this.writter.once('drain', resolve))
    }
  }

  /**
   * Finalize database file by writting index
   *
   * @returns {Promise<void>}
   */
  async close() {
    const indexPairs = this.index.length / 2
    const indexDataByteLength = this.index.length * 8
    // 1(type) + 4(count) + 3(padding)+data
    const indexLength = 1 + 4 + 3 + indexDataByteLength

    const indexBuffer = Buffer.alloc(1 + 4 + 3) // type + count + padding
    indexBuffer.writeUInt8(1, 0) // Index type, always 1
    indexBuffer.writeUInt32LE(indexPairs, 1)
    this.writter.write(indexBuffer)

    const indexDataBuffer = Buffer.alloc(indexDataByteLength)
    for (let i = 0; i < this.index.length; i++) {
      indexDataBuffer.writeBigUInt64LE(this.index[i], i * 8)
    }
    this.writter.write(indexDataBuffer)

    await new Promise((resolve) => this.writter.close(resolve))

    const file = await open(this.filePath, 'r+')
    const headerUpdateBuffer = Buffer.alloc(28)
    headerUpdateBuffer.writeBigUInt64LE(this.offset, 0) // indexOffset
    headerUpdateBuffer.writeUInt32LE(indexLength, 8) // indexLength
    headerUpdateBuffer.writeBigUInt64LE(this.dataOffset, 12) // dataOffset
    headerUpdateBuffer.writeBigUInt64LE(this.dataLength, 20) // dataLength
    await file.write(headerUpdateBuffer, 0, headerUpdateBuffer.length, 20)
    await file.close()
  }
}

export class RangeDBNode extends RangeDB {
  /**
   * Initialize database by providing url of rangedb file.
   * @param {string} urlOrPath
   * @param {import('@rangedb/js').RangeDBOptions} options
   */
  constructor(urlOrPath, options = {}) {
    super(urlOrPath, options)
  }

  /**
   * Perform range read on file.
   *
   * @protected
   * @param {bigint} start
   * @param {bigint} end
   *
   * @returns {Promise<ArrayBuffer>}
   */
  async readRange(start, end) {
    const url = this.url
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return super.readRange(start, end)
    }
    if (!this.handle) {
      this.handle = await open(url, 'r')
    }

    const length = Number(end - start) + 1

    const buffer = Buffer.alloc(length)
    await this.handle.read(buffer, 0, length, start)
    return buffer.buffer.slice()
  }

  /** Close database file.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.handle) {
      await this.handle.close()
      this.handle = null
    }
  }

  async [Symbol.asyncDispose]() {
    await this.close()
  }
}
