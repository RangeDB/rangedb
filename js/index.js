// @ts-check

/**
 * @typedef {Object} Options
 * @property {number} [firstReadSize] Specify how much should be read from the file on first call.
 * If known, it can be set to size of header + index. It will save an additional request.
 */

/**
 * @typedef {Object} Range
 * @property {bigint} [start]
 * @property {bigint} [end]
 */

/**
 * @enum {number}
 */
export const Compression = Object.freeze({
  none: 0,
  gzip: 1,
  brotli: 2,
})

/**
 * @enum {number}
 */
export const ContentType = Object.freeze({
  unknown: 0,
  json: 1,
  xml: 2,
})

/**
 * @typedef {Object} Header
 * @property {number} specVersion
 * @property {number} metadataOffset
 * @property {number} metadataLength
 * @property {number} indexOffset
 * @property {number} indexLength
 * @property {bigint} dataOffset
 * @property {bigint} dataLength
 * @property {Compression} compression
 * @property {ContentType} contentType
 */

/**
 * @typedef {string | number | boolean | null | JSONObject | JSONArray} JSONValue
 */

/**
 * @typedef {Array<JSONValue>} JSONArray
 */

/**
 * @typedef {{ [key: string]: JSONValue }} JSONObject
 */

export class RangeDB {
  /**
   * Initialize database by providing url of rangedb file.
   * @param {string} url
   * @param {Options} options
   */
  constructor(url, options = {}) {
    /** @private @type {string}  */
    this.url = url

    /** @private @type {string| null}  */
    this.etag = null

    /** @private @type {Header | null} */
    this.header = null

    /** @private @type {BigUint64Array | null}  */
    this.index = null

    /** @private @type {JSONObject| JSONArray | null}  */
    this.metadata = null

    /** @private @type {number}  */
    this.firstReadSize = options.firstReadSize ?? 64 * 1024
  }

  /**
   * Invalidate header.
   * @returns {void}
   */
  invalidate() {
    this.header = null
    this.index = null
  }

  /**
   * Perform HTTP range request.
   * @param {bigint} start
   * @param {bigint} end
   * @returns {Promise<ArrayBuffer>}
   */
  async readRange(start, end) {
    const response = await fetch(this.url, {
      headers: {
        range: `bytes=${start}-${end}`,
      },
    })

    const etag = response.headers.get('etag')
    if (this.etag && this.etag !== etag) {
      this.invalidate()
    }
    this.etag = etag

    return response.arrayBuffer()
  }

  /**
   * Get header from database or return cached
   * @returns {Promise<Header>}
   */
  async getHeader() {
    if (this.header) {
      return this.header
    }
    const buffer = await this.readRange(0n, BigInt(this.firstReadSize))
    const view = new DataView(buffer)

    const magicNumber =
      view.getUint32(0, false) === 0x52616e67 && // Rang
      view.getUint16(4, false) === 0x6544 && // eD
      view.getUint8(6) === 0x42 // B

    if (!magicNumber) {
      throw new Error(
        'Invalid Magic Number: Expected file starting with "RangeDB" or [0x52	0x61	0x6E	0x67	0x65	0x44	0x42]',
      )
    }

    const specVersion = view.getUint8(7)
    if (specVersion !== 1) {
      throw new Error(`Unsupported spec version. Expected 1 got ${specVersion}`)
    }
    const metadataOffset = view.getUint32(8, true)
    const metadataLength = view.getUint32(12, true)
    const indexOffset = view.getUint32(16, true)
    const indexLength = view.getUint32(20, true)
    const dataOffset = view.getBigUint64(24, true)
    const dataLength = view.getBigUint64(32, true)
    const compression = view.getInt8(40)
    const contentType = view.getInt8(41)

    this.header = {
      specVersion,
      metadataOffset,
      metadataLength,
      indexOffset,
      indexLength,
      dataOffset,
      dataLength,
      compression,
      contentType,
    }
    return this.header
  }

  /**
   * Load index from database or return cached
   * @returns {Promise<number>}
   */
  async getIndex() {
    if (this.index) {
      return this.index.length / 2
    }

    const { indexLength, indexOffset } = await this.getHeader()

    const buffer = await this.readRange(
      BigInt(indexOffset),
      BigInt(indexLength),
    )
    const view = new DataView(buffer)

    const indexType = view.getUint8(0)
    if (indexType !== 1) {
      throw new Error(`Unsuported index type: Expected 1 got ${indexType}`)
    }
    const count = view.getUint32(1, true)

    this.index = new BigUint64Array(buffer, 1 + 4 + 3, count * 2)
    return count
  }

  /**
   * Get metadata from database or return cached
   * @return {Promise<JSONObject | JSONArray>}
   */
  async getMetadata() {
    if (this.metadata) {
      return this.metadata
    }

    const { metadataOffset, metadataLength } = await this.getHeader()
    const buffer = await this.readRange(
      BigInt(metadataOffset),
      BigInt(metadataOffset + metadataLength - 1),
    )
    const text = new TextDecoder().decode(buffer)
    this.metadata = JSON.parse(text)
    return this.metadata
  }

  /**
   * Traverse chunk consisting of mulitple key/value pairs and returns value
   * for given key or null if not founded
   * @param {ArrayBuffer} chunk
   * @param {bigint} key
   * @returns {ArrayBuffer | null}
   */
  static findInChunk(key, chunk) {
    const view = new DataView(chunk)
    const length = chunk.byteLength
    let offset = 0

    // Chunk format
    // [Key: BigUint64][Data Length: UInt32][Data bytes]
    while (offset < length) {
      const recordKey = view.getBigUint64(offset, true)
      if (key < recordKey) {
        return null
      }
      offset += 8

      const dataLength = view.getUint32(offset, true)
      offset += 4
      if (recordKey === key) {
        return chunk.slice(offset, offset + dataLength)
      }
      offset += dataLength
    }
    return null
  }

  /**
   * Binary search in index for a given key and return value
   * @param {bigint} key
   * @param {BigUint64Array} index
   * @param {bigint} dataEndOffset one behind data ends
   * @return {Range | null} Offset of data
   */
  static binarySearch(key, index, dataEndOffset) {
    let low = 0,
      high = (index.length >> 1) - 1,
      blockIndex = -1

    while (low <= high) {
      const midPair = (low + high) >>> 1
      const midIdx = midPair * 2
      const midKey = index[midIdx]

      if (midKey === key) {
        blockIndex = midIdx
        break
      } else if (midKey < key) {
        blockIndex = midIdx
        low = midPair + 1
      } else {
        high = midPair - 1
      }
    }

    if (blockIndex === -1) {
      return null
    }
    const start = index[blockIndex + 1]
    const end =
      blockIndex + 2 < index.length ? index[blockIndex + 3] : dataEndOffset
    return {
      start,
      end,
    }
  }

  /**
   * Get raw ArrayBuffer from database for given key
   * @param {bigint} key
   * @returns {Promise<ArrayBuffer | null>}
   * */
  async getRaw(key) {
    if (!this.index) {
      await this.getIndex()
    }
    const { dataOffset, dataLength } = this.header
    const range = RangeDB.binarySearch(key, this.index, dataOffset + dataLength)
    if (!range) {
      return null
    }
    const { start, end } = range
    const chunkBuffer = await this.readRange(start, end)

    return RangeDB.findInChunk(key, chunkBuffer)
  }
}
