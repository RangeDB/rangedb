// @ts-check

import { createWriteStream } from 'node:fs'
import { open } from 'node:fs/promises'

export const VERSION = 1

/**
 * @typedef {Object} Options
 *
 * @property {Object} [metadata]
 * Arbitrary metadata for database as a JSON.
 *
 * @property {number} [chunkSize]
 * Number of records in one chunk. How many records can share one entry in index.
 * More items in chunk smaller the index is but more is fetched for a single get query.
 */

export class RangeDbBuilder {
  /**
   *
   * @param {string} filePath
   * @param {Options} options
   */
  constructor(filePath, options = {}) {
    /** @private @type {string} */
    this.filePath = filePath

    /** @private @type {import('node:fs').WriteStream | null}  */
    this.writter = createWriteStream(filePath)

    /** @private @type {number}  */
    this.chunkSize = options.chunkSize ?? 1

    /** @private @type {BigInt} */
    this.lastKey = null

    /** @pricate @type {BigInt[]} */
    this.index = []

    /** @private @type {number} */
    this.records = 0

    /** @private @type {BigInt} */
    this.offset = 0n

    /** @private @type {BigInt} */
    this.dataOffset = 0n

    /** @private @type {BigInt} */
    this.dataLength = 0n

    const metadata = Buffer.from(JSON.stringify(options.metadata ?? null))

    const header = Buffer.alloc(60)
    header.writeUint32LE(0x52616e67, 0) // Rang
    header.writeUint16LE(0x6544, 4) // eD
    header.writeUint8(0x42, 6) // eD
    header.writeUint8(VERSION, 7)
    header.writeUint32LE(header.length, 8) // metadata offset
    header.writeUint32LE(metadata.length, 12) // metadata length
    header.writeUint32LE(0, 16) // index offset
    header.writeUint32LE(0, 20) // index length
    header.writeBigUInt64LE(0n, 24) // data offset
    header.writeBigUInt64LE(0n, 32) // data length
    header.writeUInt8(0, 40) // compression
    header.writeUInt8(0, 40) // contentType

    this.writter.write(header)
    this.offset += BigInt(header.length)
    this.writter.write(metadata)
    this.offset += BigInt(metadata.length)
    this.dataOffset = this.offset
  }

  /**
   * Add record into database file
   * @param {BigInt} key
   * @param {ArrayBuffer} data
   * @returns {Promise<void>}
   */
  async addRecord(key, data) {
    if (this.lastKey !== null && this.lastKey > key) {
      throw new Error(
        `Records must be added in increasing order. Current key ${key} is not bigger than previous key ${this.lastKey}`,
      )
    }
    this.lastKey = key

    if (this.records % this.chunkSize === 0) {
      this.index.push(key, this.dataLength)
    }

    const recordLength = 8n + 4n + BigInt(data.byteLength)
    const record = Buffer.alloc(12)
    record.writeBigUint64LE(key, 0)
    record.writeUint32LE(data.byteLength, 8)
    const fine = this.writter.write(record) && this.writter.write(data)
    this.offset += recordLength
    this.dataLength += recordLength
    if (!fine) {
      await new Promise((resolve) => this.writter.once('drain', resolve))
    }
  }

  /**
   * Finalize database file by writting index
   */
  async close() {
    const indexSize = this.index.length
    const indexLength = 1 + 4 + indexSize * 2 * 8
    const indexBuffer = Buffer.alloc(1 + 4)
    indexBuffer.writeUInt8(1, 0) // Index type, always 1
    indexBuffer.writeInt32LE(indexSize, 1)
    this.writter.write(indexBuffer)
    this.writter.write(new BigUint64Array(this.index))
    this.writter.close()

    const buffer = Buffer.alloc(2 * 4 + 2 * 8)
    // buffer.writeInt32LE(this.offset, 0)// TODO
    buffer.writeInt32LE(indexLength, 4)
    buffer.writeBigUInt64LE(this.dataOffset, 8)
    buffer.writeBigUInt64LE(this.dataLength, 16)

    const file = await open(this.filePath, 'r+')
    file.write(buffer, 16, buffer.length, 0)
    file.close()
  }
}
