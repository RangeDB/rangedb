export class RangeDBCloudflare extends RangeDB {
    /**
     * Initialize database by providing Cloudflare R2 bucket and file name.
     *
     * @param {R2Bucket} bucket Cloudflare R2 Bucket binding
     * @param {string} key Name of the file in the bucket
     * @param {import('@rangedb/js').RangeDBOptions} [options]
     */
    constructor(bucket: R2Bucket, key: string, options?: import("@rangedb/js").RangeDBOptions);
    /** @private @type {R2Bucket} */
    private bucket;
    /** @private @type {string} */
    private key;
}
import { RangeDB } from '@rangedb/js';
