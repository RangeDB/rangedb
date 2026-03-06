export type Compression = number;
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
export const Compression: Readonly<{
    none: 0;
    gzip: 1;
    brotli: 2;
}>;
export type ContentType = number;
/**
 * @enum {number}
 */
export const ContentType: Readonly<{
    unknown: 0;
    json: 1;
    xml: 2;
}>;
/**
 * @typedef {Object} Header
 * @property {number} specVersion
 * @property {bigint} metadataOffset
 * @property {number} metadataLength
 * @property {bigint} indexOffset
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
     * Traverse chunk consisting of mulitple key/value pairs and returns value
     * for given key or null if not founded
     * @private
     * @param {ArrayBuffer} chunk
     * @param {bigint} key
     *
     * @returns {ArrayBuffer | null}
     */
    private static findInChunk;
    /**
     * Binary search in index for a given key and return value
     * @param {bigint} key
     * @param {BigUint64Array} index
     * @param {bigint} dataEndOffset one behind data ends
     *
     * @return {Range | null} Offset of data
     */
    static binarySearch(key: bigint, index: BigUint64Array, dataEndOffset: bigint): Range | null;
    /**
     * Initialize database by providing url of rangedb file.
     * @param {string} url
     * @param {Options} options
     */
    constructor(url: string, options?: Options);
    /** @protected @type {string}  */
    protected _url: string;
    /** @private @type {string| null}  */
    private etag;
    /** @private @type {Header | null} */
    private header;
    /** @private @type {BigUint64Array | null}  */
    private index;
    /** @private @type {JSONObject| JSONArray | null}  */
    private metadata;
    /** @private @type {number}  */
    private firstReadSize;
    /**
     * Invalidate header.
     * @returns {void}
     */
    invalidate(): void;
    /**
     * Perform HTTP range request.
     * @protected
     * @param {bigint} start
     * @param {bigint} end
     * @returns {Promise<ArrayBuffer>}
     */
    protected readRange(start: bigint, end: bigint): Promise<ArrayBuffer>;
    /**
     * Get header from database or return cached
     * @returns {Promise<Header>}
     */
    getHeader(): Promise<Header>;
    /**
     * Load index from database or return cached
     * @private
     * @returns {Promise<number>}
     */
    private getIndex;
    /**
     * Get metadata from database or return cached
     *
     * @return {Promise<JSONObject | JSONArray>}
     */
    getMetadata(): Promise<JSONObject | JSONArray>;
    /**
     * Get a raw ArrayBuffer from database for given key or null if not exists
     *
     * @param {bigint} key
     *
     * @returns {Promise<ArrayBuffer | null>}
     * */
    getRaw(key: bigint): Promise<ArrayBuffer | null>;
    /**
     * Get a JSON from database for a given key or null if not exists
     * It may throw JSON parsing error
     *
     * @param {bigint} key
     *
     * @returns {Promise<JSONValue | null>}
     * @throws {SyntaxError}
     */
    getJson(key: bigint): Promise<JSONValue | null>;
}
export type Options = {
    /**
     * Specify how much should be read from the file on first call.
     * If known, it can be set to size of header + index. It will save an additional request.
     */
    firstReadSize?: number;
};
export type Range = {
    start?: bigint;
    end?: bigint;
};
export type Header = {
    specVersion: number;
    metadataOffset: bigint;
    metadataLength: number;
    indexOffset: bigint;
    indexLength: number;
    dataOffset: bigint;
    dataLength: bigint;
    compression: Compression;
    contentType: ContentType;
};
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONArray = Array<JSONValue>;
export type JSONObject = {
    [key: string]: JSONValue;
};
