export const VERSION: 1;
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
    constructor(filePath: string, options?: Options);
    /** @private @type {string} */
    private filePath;
    /** @private @type {import('node:fs').WriteStream | null}  */
    private writter;
    /** @private @type {number}  */
    private chunkSize;
    /** @private @type {BigInt} */
    private lastKey;
    /** @private @type {BigInt[]} */
    private index;
    /** @private @type {number} */
    private records;
    /** @private @type {BigInt} */
    private offset;
    /** @private @type {BigInt} */
    private dataOffset;
    /** @private @type {BigInt} */
    private dataLength;
    /**
     * Add record into database file
     *
     * @param {BigInt} key
     * @param {ArrayBuffer} data
     *
     * @returns {Promise<void>}
     * @throws Error if record key are not in increasing orders
     */
    addRecord(key: bigint, data: ArrayBuffer): Promise<void>;
    /**
     * Finalize database file by writting index
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
}
export type Options = {
    /**
     * Arbitrary metadata for database as a JSON.
     */
    metadata?: any;
    /**
     * Number of records in one chunk. How many records can share one entry in index.
     * More items in chunk smaller the index is but more is fetched for a single get query.
     */
    chunkSize?: number;
};
