// ts-check

import { equal, ok, rejects } from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { RangeDBBuilder, RangeDBNode, VERSION } from './index.js'

describe('RangeDB', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rangedb-test'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  describe('RangeDBBuilder', () => {
    it('should create empty database with default options', async () => {
      const filePath = join(tmpDir, 'empty.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.close()

      const b = await readFile(filePath)
      equal(b.toString('ascii', 0, 7), 'RangeDB') // Magic number
      equal(b.readUint8(7), VERSION)

      const metadataOffset = b.readBigUInt64LE(8)
      const metadataLength = b.readUint32LE(16)
      const indexOffset = b.readBigUInt64LE(20)
      const indexLength = b.readUInt32LE(28)

      equal(metadataOffset, 60n)
      equal(metadataLength, 4) // "null" stringified
      equal(indexOffset, 64n) // 60 header + 4 metadata
      equal(indexLength, 8) // 1(type)+4(length)+3(padding)

      const metadataBuffer = b.subarray(
        Number(metadataOffset),
        Number(metadataOffset) + metadataLength,
      )
      equal(metadataBuffer.toString('utf8'), 'null')
    })

    it('should create database with custom metadata', async () => {
      const filePath = join(tmpDir, 'metadata.rangedb')
      const metadata = { foo: 'bar' }
      const builder = new RangeDBBuilder(filePath, { metadata })
      await builder.close()

      const b = await readFile(filePath)

      const metadataOffset = b.readBigUInt64LE(8)
      const metadataLength = b.readUint32LE(16)

      const metadataBuffer = b.subarray(
        Number(metadataOffset),
        Number(metadataOffset) + metadataLength,
      )
      equal(metadataBuffer.toString('utf8'), JSON.stringify(metadata))
    })

    it('should add records and update index/data offsets correctly', async () => {
      const filePath = join(tmpDir, 'data.rangedb')
      const builder = new RangeDBBuilder(filePath)

      const record1 = Buffer.from('record1')
      const record2 = Buffer.from('record2')

      await builder.addRecord(10, record1)
      await builder.addRecord(20, record2)
      await builder.close()

      const fileBuffer = await readFile(filePath)

      const indexOffset = fileBuffer.readBigUInt64LE(20)
      const indexLength = fileBuffer.readUint32LE(28)
      const dataOffset = fileBuffer.readBigUInt64LE(32)
      const dataLength = fileBuffer.readBigUInt64LE(40)

      equal(dataOffset, 64n) // 60 (header) + 4 (metadata "null")

      // Each record is: 8 (key) + 4 (length) + data.byteLength
      const record1TotalLength = 8n + 4n + BigInt(record1.byteLength) // 19n
      const record2TotalLength = 8n + 4n + BigInt(record2.byteLength) // 19n
      equal(dataLength, record1TotalLength + record2TotalLength) // 38n

      equal(indexOffset, dataOffset + dataLength)

      const indexBuffer = fileBuffer.subarray(
        Number(indexOffset),
        Number(indexOffset) + indexLength,
      )
      equal(indexBuffer.readUint8(0), 1) // index type
      const indexPairs = indexBuffer.readUint32LE(1)

      equal(indexPairs, 2)

      const indexDataOffset = 8 // 1(type) + 4(count) + 3(padding)
      const indexKey1 = indexBuffer.readBigUInt64LE(indexDataOffset)
      const indexRecordOffset1 = indexBuffer.readBigUInt64LE(
        indexDataOffset + 8,
      )
      const indexKey2 = indexBuffer.readBigUInt64LE(indexDataOffset + 16)
      const indexRecordOffset2 = indexBuffer.readBigUInt64LE(
        indexDataOffset + 24,
      )

      equal(indexKey1, 10n)
      equal(indexRecordOffset1, 64n)
      equal(indexKey2, 20n)
      equal(indexRecordOffset2, 83n)
    })

    it('should chunk index correctly', async () => {
      const filePath = join(tmpDir, 'chunk.db')
      const builder = new RangeDBBuilder(filePath, { chunkSize: 2 })
      await builder.addRecord(10, 'record1')
      await builder.addRecord(20, 'record2')
      await builder.addRecord(30, 'record3')
      await builder.close()

      const fileBuffer = await readFile(filePath)
      const indexOffset = fileBuffer.readBigUInt64LE(20)
      const indexLength = fileBuffer.readUint32LE(28)
      const indexBuffer = fileBuffer.subarray(
        Number(indexOffset),
        Number(indexOffset) + indexLength,
      )

      const indexPairs = indexBuffer.readUint32LE(1)
      equal(indexPairs, 2)
    })

    it('should throw if records added in non-increasing order', async () => {
      const filePath = join(tmpDir, 'error.rangedb')
      const builder = new RangeDBBuilder(filePath)

      await builder.addRecord(20, 'record2')
      await rejects(() => builder.addRecord(10, 'record1'), {
        message: 'Records must be added in increasing order. Current key 10 is not bigger than previous key 20',
      })
    })

    it('should create readable database', async () => {
      const filePath = join(tmpDir, 'readable.rangedb')
      const builder = new RangeDBBuilder(filePath)
      const items = new Array(100).fill(null).map((_, i) => i)
      for (const i of items) {
        await builder.addRecord(i, Buffer.from(`Record ${i}`))
      }
      await builder.close()

      const db = new RangeDBNode(filePath)
      const record = await db.getRaw(30)

      equal(Buffer.from(record).toString('utf8'), 'Record 30')
      equal(await db.getRaw(1000), null)
      await db.close()
    })

    it('should hit watermark', async () => {
      const filePath = join(tmpDir, 'watermark.rangedb')
      const builder = new RangeDBBuilder(filePath)
      const buffer = Buffer.alloc(70_000)
      await builder.addRecord(1, buffer)
      await builder.close()
    })

    it('should add string', async () => {
      const filePath = join(tmpDir, 'string.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.addRecord(1, 'String entry')
      await builder.close()
    })

    it('should add object', async () => {
      const filePath = join(tmpDir, 'object.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.addRecord(1, { str: 'String entry', a: 15 })
      await builder.close()
    })

    it('should fail when adding not safe number', async () => {
      const filePath = join(tmpDir, 'object.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await rejects(() => builder.addRecord(Number.MAX_SAFE_INTEGER + 1, 'too big'), {
        message: 'Key is bigger than MAX_SAFE_INTEGER. Use BigInt instead.',
      })
    })
  })

  describe('RangeDBNode', () => {
    it('should open url', async () => {
      const filePath = join(tmpDir, 'empty.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.init()
      await builder.close()

      const { buffer } = await readFile(filePath)
      mock.method(global, 'fetch', (_url, { headers }) => {
        const { range } = headers
        const [_, start, end] = range.match(/bytes=(\d+)-(\d+)/)
        return Promise.resolve({
          headers: {
            get: () => 'etag',
          },
          arrayBuffer: () => Promise.resolve(buffer.slice(start, end + 1)),
        })
      })

      const db = new RangeDBNode('http://localhost/empty.rangedb')
      equal(await db.getRaw(1n), null)
    })

    it('should throw error if file does not exist', async () => {
      const db = new RangeDBNode('nonexistent.rangedb')
      await rejects(() => db.getRaw(1n), {
        message: 'ENOENT: no such file or directory, open \'nonexistent.rangedb\'',
      })
    })

    it('should close file', async () => {
      const filePath = join(tmpDir, 'close.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.init()
      await builder.close()

      const db = new RangeDBNode(filePath)
      await db.getRaw(1n)
      ok(db.handle, 'Handle should be opened')
      await db.close()
      equal(db.handle, null, 'Handle should be closed')
    })

    it('should dispose handle', async () => {
      const filePath = join(tmpDir, 'dispose.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.init()
      await builder.close()

      const db = new RangeDBNode(filePath)
      {
        await using dbUsed = db
        await dbUsed.getRaw(1n)
        ok(dbUsed.handle, 'Handle should be opened')
      }
      equal(db.handle, null, 'Handle should be closed')
    })
  })
})
