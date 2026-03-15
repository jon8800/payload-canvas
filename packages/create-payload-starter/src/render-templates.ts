import * as p from '@clack/prompts'
import ejs from 'ejs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Selections } from './prompts.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve templates directory relative to the CLI package root
const templatesDir = path.resolve(__dirname, '..', 'templates')

type TemplateData = {
  collections: string[]
  plugins: string[]
}

export async function renderTemplates(targetDir: string, selections: Selections): Promise<void> {
  const s = p.spinner()
  s.start('Rendering templates...')

  const data: TemplateData = {
    collections: selections.collections,
    plugins: selections.plugins,
  }

  // Render payload.config.ts
  const configTemplate = path.join(templatesDir, 'payload.config.ts.ejs')
  const configOutput = await ejs.renderFile(configTemplate, data)
  fs.writeFileSync(path.join(targetDir, 'src', 'payload.config.ts'), configOutput, 'utf-8')

  // Render Posts.ts (only if posts selected)
  if (selections.collections.includes('posts')) {
    const postsTemplate = path.join(templatesDir, 'Posts.ts.ejs')
    const postsOutput = await ejs.renderFile(postsTemplate, data)
    fs.writeFileSync(path.join(targetDir, 'src', 'collections', 'Posts.ts'), postsOutput, 'utf-8')
  }

  // Render TemplateParts.ts (only if template-parts selected)
  if (selections.collections.includes('template-parts')) {
    const tpTemplate = path.join(templatesDir, 'TemplateParts.ts.ejs')
    const tpOutput = await ejs.renderFile(tpTemplate, data)
    fs.writeFileSync(path.join(targetDir, 'src', 'collections', 'TemplateParts.ts'), tpOutput, 'utf-8')
  }

  // Clean up unselected collection files
  if (!selections.collections.includes('posts')) {
    const postsFiles = [
      'src/collections/Posts.ts',
      'src/collections/Categories.ts',
      'src/collections/Tags.ts',
      'src/hooks/revalidatePost.ts',
    ]
    const postsDirs = ['src/app/(frontend)/blog']

    for (const file of postsFiles) {
      const filePath = path.join(targetDir, file)
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath)
      }
    }

    for (const dir of postsDirs) {
      const dirPath = path.join(targetDir, dir)
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true })
      }
    }
  }

  if (!selections.collections.includes('template-parts')) {
    const tpFiles = [
      'src/collections/TemplateParts.ts',
      'src/hooks/revalidateTemplatePart.ts',
    ]

    for (const file of tpFiles) {
      const filePath = path.join(targetDir, file)
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath)
      }
    }
  }

  s.stop('Templates rendered.')
}
