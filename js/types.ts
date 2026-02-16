export interface Options {
  /**
   * Specify how much should be read from the file on fist call.
   * If know, it can be set to size of header + index. It will
   * save additional request.
   */
  readonly firstReadSize?: number
}

export enum Compression {
  none = 0,
  gzip = 1,
}

export enum ContentType {
  unknown = 0,
  json = 1,
}

export interface Header {
  specVersion: number
  metadataOffset: number
  metadataLength: number
  indexOffset: number
  indexLength: number
  dataOffset: bigint
  dataLength: bigint
  compression: Compression
  contentType: ContentType
}
