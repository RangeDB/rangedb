// @ts-check

/**
 * @typedef {Object} Options
 * @property {number} [firstReadSize] Specify how much should be read from the file on first call.
 * If known, it can be set to size of header + index. It will save an additional request.
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
   * @param {number} start
   * @param {number} end
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

    const buffer = await this.readRange(0, this.firstReadSize)
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
      throw new Error('Unsupported spec version. Expected 1 got ' + specVersion)
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

  /** Load index from database or return cached
   * @returns{Promise<number>}
   */
  async getIndex() {
    if (this.index) {
      return this.index.length / 2
    }

    const { indexLength, indexOffset } = await this.getHeader()

    const buffer = await this.readRange(indexOffset, indexLength)
    const view = new DataView(buffer)

    const indexType = view.getUint8(0)
    if (indexType !== 1) {
      throw new Error('Unsuported index type: Expected 1 got ' + indexType)
    }
    const count = view.getUint32(1, true)

    this.index = new BigUint64Array(buffer, 1 + 4 + 3, count * 2)
    return count
  }

  /**  Get metadata from database or return cached
   * @return {Promise<JSONObject | JSONArray>}
   */
  async getMetadata() {
    if (this.metadata) {
      return this.metadata
    }

    const { metadataOffset, metadataLength } = await this.getHeader()
    const buffer = await this.readRange(
      metadataOffset,
      metadataOffset + metadataLength - 1,
    )
    const text = new TextDecoder().decode(buffer)
    this.metadata = JSON.parse(text)
    return this.metadata
  }
}
