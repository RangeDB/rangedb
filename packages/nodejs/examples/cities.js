import { readFileSync } from 'node:fs'
import { RangeDBBuilder, RangeDBNode } from '@rangedb/nodejs'

// const response = await fetch(
//     'https://raw.githubusercontent.com/lutangar/cities.json/refs/heads/master/cities.json',
// )
// const json = await response.json()

const file = await readFileSync('cities.json')
const json = JSON.parse(file)

// Writting
const builder = new RangeDBBuilder('cities.rangedb', { chunkSize: 1 })

for (const [i, c] of json.entries()) {
    const s = JSON.stringify(c)
    const buffer = Buffer.from(s)
    if (c.name === 'Bratislava') console.log(i)
    await builder.addRecord(BigInt(i), buffer)
}

await builder.close()

// Reading
const db = new RangeDBNode('cities.rangedb')
const decoder = new TextDecoder()
const bratislava = await db.getRaw(127057n)
console.log(decoder.decode(bratislava))
