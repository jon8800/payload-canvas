import * as p from '@clack/prompts'

export type Selections = {
  projectName: string
  dbHost: string
  dbPort: string
  dbUser: string
  dbPassword: string
  adminEmail: string
  adminPassword: string
  collections: string[]
  plugins: string[]
  smtp?: {
    host: string
    port: string
    user: string
    pass: string
    from: string
  }
}

export async function runPrompts(): Promise<Selections> {
  const project = await p.group(
    {
      projectName: () =>
        p.text({
          message: 'Project name',
          placeholder: 'my-website',
          defaultValue: 'my-website',
          validate: (value) => {
            if (!value || !/^[a-z0-9-]+$/.test(value)) {
              return 'Only lowercase letters, numbers, and hyphens are allowed.'
            }
          },
        }),
      dbHost: () =>
        p.text({
          message: 'Database host',
          placeholder: 'localhost',
          defaultValue: 'localhost',
        }),
      dbPort: () =>
        p.text({
          message: 'Database port',
          placeholder: '5432',
          defaultValue: '5432',
        }),
      dbUser: () =>
        p.text({
          message: 'Database user',
          placeholder: 'postgres',
          defaultValue: 'postgres',
        }),
      dbPassword: () =>
        p.password({
          message: 'Database password',
          validate: (value) => {
            if (!value) return 'Password is required.'
          },
        }),
      adminEmail: () =>
        p.text({
          message: 'Admin email',
          placeholder: 'admin@example.com',
          validate: (value) => {
            if (!value || !value.includes('@')) return 'Please enter a valid email address.'
          },
        }),
      adminPassword: () =>
        p.password({
          message: 'Admin password',
          validate: (value) => {
            if (!value || value.length < 8) return 'Password must be at least 8 characters.'
          },
        }),
      collections: () =>
        p.multiselect({
          message: 'Select optional collections',
          options: [
            { value: 'posts', label: 'Posts (includes Categories & Tags)', hint: 'Blog system' },
            { value: 'template-parts', label: 'Template Parts', hint: 'Headers, footers, reusable sections' },
          ],
          initialValues: ['posts', 'template-parts'],
          required: false,
        }),
      plugins: () =>
        p.multiselect({
          message: 'Select optional plugins',
          options: [
            { value: 'seo', label: 'SEO' },
            { value: 'redirects', label: 'Redirects' },
            { value: 'form-builder', label: 'Form Builder' },
            { value: 'nested-docs', label: 'Nested Docs' },
            { value: 'import-export', label: 'Import/Export' },
            { value: 'mcp', label: 'MCP' },
            { value: 'search', label: 'Search' },
          ],
          initialValues: ['seo', 'redirects', 'form-builder', 'nested-docs', 'import-export', 'mcp', 'search'],
          required: false,
        }),
      smtpSetup: () =>
        p.confirm({
          message: 'Configure SMTP email?',
          initialValue: false,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.')
        process.exit(0)
      },
    },
  )

  // Enforce collection dependencies: Posts includes Categories and Tags
  let collections = project.collections as string[]
  if (collections.includes('posts')) {
    const deps = ['categories', 'tags']
    const added: string[] = []
    for (const dep of deps) {
      if (!collections.includes(dep)) {
        collections.push(dep)
        added.push(dep)
      }
    }
    if (added.length > 0) {
      p.log.info(`Auto-included ${added.join(', ')} (required by Posts)`)
    }
  }

  // Conditional SMTP prompts
  let smtp: Selections['smtp']
  if (project.smtpSetup) {
    const smtpConfig = await p.group(
      {
        host: () =>
          p.text({
            message: 'SMTP host',
            placeholder: 'smtp.example.com',
          }),
        port: () =>
          p.text({
            message: 'SMTP port',
            placeholder: '587',
            defaultValue: '587',
          }),
        user: () =>
          p.text({
            message: 'SMTP user',
            placeholder: 'user@example.com',
          }),
        pass: () =>
          p.password({
            message: 'SMTP password',
          }),
        from: () =>
          p.text({
            message: 'SMTP from address',
            placeholder: 'noreply@example.com',
          }),
      },
      {
        onCancel: () => {
          p.cancel('Setup cancelled.')
          process.exit(0)
        },
      },
    )
    smtp = {
      host: smtpConfig.host as string,
      port: smtpConfig.port as string,
      user: smtpConfig.user as string,
      pass: smtpConfig.pass as string,
      from: smtpConfig.from as string,
    }
  }

  return {
    projectName: project.projectName as string,
    dbHost: project.dbHost as string,
    dbPort: project.dbPort as string,
    dbUser: project.dbUser as string,
    dbPassword: project.dbPassword as string,
    adminEmail: project.adminEmail as string,
    adminPassword: project.adminPassword as string,
    collections,
    plugins: project.plugins as string[],
    smtp,
  }
}
