#!/usr/bin/env node

import { createRequire } from 'node:module'
import { RangeDBNode } from '@rangedb/nodejs'
import { cac } from 'cac'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const cli = cac('rangedb')

cli
    .command(
        'show <path-or-url>',
        'Inspect a local or remote rangedb header',
    )
    .action(async (pathOrUrl) => {
        try {
            const db = new RangeDBNode(pathOrUrl)
            const header = await db.getHeader()
            console.log(header)
            await db.close()
        } catch (error) {
            console.error(error)
            process.exit(1)
        }
    })

cli.version(pkg.version)
cli.help()

cli.parse()

if (!cli.matchedCommand) {
    cli.outputHelp()
}