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
    await builder.addRecord(i, c)
}

await builder.close()

// Reading
const db = new RangeDBNode('cities.rangedb')
const bratislava = await db.getJson(127057)
console.log(bratislava)
