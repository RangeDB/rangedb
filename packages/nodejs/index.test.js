// ts-check

import assert from 'node:assert/strict'
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
      assert.equal(b.toString('ascii', 0, 7), 'RangeDB') // Magic number
      assert.equal(b.readUint8(7), VERSION)

      const metadataOffset = b.readBigUInt64LE(8)
      const metadataLength = b.readUint32LE(16)
      const indexOffset = b.readBigUInt64LE(20)
      const indexLength = b.readUInt32LE(28)

      assert.equal(metadataOffset, 60n)
      assert.equal(metadataLength, 4) // "null" stringified
      assert.equal(indexOffset, 64n) // 60 header + 4 metadata
      assert.equal(indexLength, 8) // 1(type)+4(length)+3(padding)

      const metadataBuffer = b.subarray(
        Number(metadataOffset),
        Number(metadataOffset) + metadataLength,
      )
      assert.equal(metadataBuffer.toString('utf8'), 'null')
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
      assert.equal(metadataBuffer.toString('utf8'), JSON.stringify(metadata))
    })

    it('should add records and update index/data offsets correctly', async () => {
      const filePath = join(tmpDir, 'data.rangedb')
      const builder = new RangeDBBuilder(filePath)

      const record1 = Buffer.from('record1')
      const record2 = Buffer.from('record2')

      await builder.addRecord(10n, record1)
      await builder.addRecord(20n, record2)
      await builder.close()

      const fileBuffer = await readFile(filePath)

      const indexOffset = fileBuffer.readBigUInt64LE(20)
      const indexLength = fileBuffer.readUint32LE(28)
      const dataOffset = fileBuffer.readBigUInt64LE(32)
      const dataLength = fileBuffer.readBigUInt64LE(40)

      assert.equal(dataOffset, 64n) // 60 (header) + 4 (metadata "null")

      // Each record is: 8 (key) + 4 (length) + data.byteLength
      const record1TotalLength = 8n + 4n + BigInt(record1.byteLength) // 19n
      const record2TotalLength = 8n + 4n + BigInt(record2.byteLength) // 19n
      assert.equal(dataLength, record1TotalLength + record2TotalLength) // 38n

      assert.equal(indexOffset, dataOffset + dataLength)

      const indexBuffer = fileBuffer.subarray(
        Number(indexOffset),
        Number(indexOffset) + indexLength,
      )
      assert.equal(indexBuffer.readUint8(0), 1) // index type
      const indexPairs = indexBuffer.readUint32LE(1)

      assert.equal(indexPairs, 2)

      const indexDataOffset = 8 // 1(type) + 4(count) + 3(padding)
      const indexKey1 = indexBuffer.readBigUInt64LE(indexDataOffset)
      const indexRecordOffset1 = indexBuffer.readBigUInt64LE(
        indexDataOffset + 8,
      )
      const indexKey2 = indexBuffer.readBigUInt64LE(indexDataOffset + 16)
      const indexRecordOffset2 = indexBuffer.readBigUInt64LE(
        indexDataOffset + 24,
      )

      assert.equal(indexKey1, 10n)
      assert.equal(indexRecordOffset1, 64n)
      assert.equal(indexKey2, 20n)
      assert.equal(indexRecordOffset2, 83n)
    })

    it('should chunk index correctly', async () => {
      const filePath = join(tmpDir, 'chunk.db')
      const builder = new RangeDBBuilder(filePath, { chunkSize: 2 })
      await builder.addRecord(10n, Buffer.from('record1'))
      await builder.addRecord(20n, Buffer.from('record2'))
      await builder.addRecord(30n, Buffer.from('record3'))
      await builder.close()

      const fileBuffer = await readFile(filePath)
      const indexOffset = fileBuffer.readBigUInt64LE(20)
      const indexLength = fileBuffer.readUint32LE(28)
      const indexBuffer = fileBuffer.subarray(
        Number(indexOffset),
        Number(indexOffset) + indexLength,
      )

      const indexPairs = indexBuffer.readUint32LE(1)
      assert.equal(indexPairs, 2)
    })

    it('should throw if records added in non-increasing order', async () => {
      const filePath = join(tmpDir, 'error.rangedb')
      const builder = new RangeDBBuilder(filePath)

      await builder.addRecord(20n, Buffer.from('record2'))
      await assert.rejects(
        () => builder.addRecord(10n, Buffer.from('record1')),
        {
          message: /Records must be added in increasing order/,
        },
      )
    })

    it('should create readable database', async () => {
      const filePath = join(tmpDir, 'readable.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await Promise.all(
        new Array(100)
          .fill(null)
          .map((_, i) =>
            builder.addRecord(BigInt(i), Buffer.from(`Record ${i}`)),
          ),
      )
      await builder.close()

      const db = new RangeDBNode(filePath)
      const record = await db.getRaw(30n)

      assert.equal(Buffer.from(record).toString('utf8'), 'Record 30')
      assert.equal(await db.getRaw(1000n), null)
      await db.close()
    })

    it('should hit watermark', async () => {
      const filePath = join(tmpDir, 'watermark.rangedb')
      const builder = new RangeDBBuilder(filePath)
      const buffer = Buffer.alloc(70_000)
      await builder.addRecord(1n, buffer)
      await builder.close()
    })
  })

  describe('RangeDBNode', () => {
    it('should open url', async () => {
      const filePath = join(tmpDir, 'empty.rangedb')
      const builder = new RangeDBBuilder(filePath)
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
      assert.equal(await db.getRaw(1n), null)
    })

    it('should throw error if file does not exist', async () => {
      const db = new RangeDBNode('nonexistent.rangedb')
      assert.rejects(() => db.getRaw(1n), {
        message: /ENOENT: no such file or directory/,
      })
    })

    it('should close file', async () => {
      const filePath = join(tmpDir, 'close.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.close()

      const db = new RangeDBNode(filePath)
      await db.getRaw(1n)
      assert.ok(db.handle, 'Handle should be opened')
      await db.close()
      assert.equal(db.handle, null, 'Handle should be closed')
    })

    it('should dispose handle', async () => {
      const filePath = join(tmpDir, 'dispose.rangedb')
      const builder = new RangeDBBuilder(filePath)
      await builder.close()

      const db = new RangeDBNode(filePath)
      {
        await using dbUsed = db
        await dbUsed.getRaw(1n)
        assert.ok(dbUsed.handle, 'Handle should be opened')
      }
      assert.equal(db.handle, null, 'Handle should be closed')
    })
  })
})
