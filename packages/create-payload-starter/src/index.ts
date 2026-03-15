#!/usr/bin/env node

import * as p from '@clack/prompts'
import path from 'node:path'

import { runPrompts } from './prompts.js'
import { scaffoldProject } from './scaffold.js'
import { renderTemplates } from './render-templates.js'
import { postScaffold } from './post-scaffold.js'

async function main() {
  p.intro('Create Payload Starter')

  const selections = await runPrompts()

  const targetDir = path.resolve(process.cwd(), selections.projectName)

  await scaffoldProject(targetDir)
  await renderTemplates(targetDir, selections)
  await postScaffold(targetDir, selections)

  p.outro(`Done! cd ${selections.projectName} && pnpm dev`)
}

main().catch((err) => {
  p.cancel('An error occurred.')
  p.log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
