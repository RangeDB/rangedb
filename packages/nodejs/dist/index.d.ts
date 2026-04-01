export const VERSION: 1;
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
    constructor(filePath: string, options?: BuilderOptions);
    /** @private @type {string} */
    private filePath;
    /** @private @type {import('node:fs/promises').FileHandle | null}  */
    private fileHandle;
    /** @private @type {number}  */
    private chunkSize;
    /** @private @type {bigint} */
    private lastKey;
    /** @private @type {bigint[]} */
    private index;
    /** @private @type {number} */
    private records;
    /** @private @type {bigint} */
    private offset;
    /** @private @type {bigint} */
    private dataOffset;
    /** @private @type {bigint} */
    private dataLength;
    /** @private @type {any} */
    private metadata;
    /**
     * Initialize database file. Called automatically when adding a record.
     *
     * @returns {Promise<void>}
     */
    init(): Promise<void>;
    /**
     * Handle appending to file
     *
     * @private
     *
     * @param {Buffer} chunk
     * @return {Promise<void>}
     */
    private write;
    /**
     * Add record into database file
     *
     * @param {bigint | number} key
     * @param {Buffer | string} data
     *
     * @returns {Promise<void>}
     * @throws Error if record key are not in increasing orders
     */
    addRecord(key: bigint | number, data: Buffer | string): Promise<void>;
    /**
     * Finalize database file by writting index
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
}
export class RangeDBNode extends RangeDB {
    handle: import("node:fs/promises").FileHandle;
    /** Close database file.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
}
export type BuilderOptions = {
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
import { RangeDB } from '@rangedb/js';
