import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

type GenerateEnvOptions = {
  projectName: string
  dbHost: string
  dbPort: string
  dbUser: string
  dbPassword: string
  adminEmail?: string
  overwrite?: boolean
  smtp?: {
    host: string
    port: string
    user: string
    pass: string
    from: string
  }
}

export function generateEnv(options: GenerateEnvOptions): void {
  const envPath = path.resolve(process.cwd(), '.env')

  if (fs.existsSync(envPath) && !options.overwrite) {
    console.warn('.env already exists -- skipping generation. Pass overwrite: true to regenerate.')
    return
  }

  const templatePath = path.resolve(process.cwd(), '.env.example')
  if (!fs.existsSync(templatePath)) {
    throw new Error('.env.example not found. Cannot generate .env without template.')
  }

  let content = fs.readFileSync(templatePath, 'utf-8')

  // Replace DATABASE_URL
  const dbUrl = `postgresql://${options.dbUser}:${options.dbPassword}@${options.dbHost}:${options.dbPort}/${options.projectName}`
  content = content.replace(
    /^DATABASE_URL=.*/m,
    `DATABASE_URL=${dbUrl}`,
  )

  // Replace PAYLOAD_SECRET with random value
  const secret = crypto.randomBytes(16).toString('hex')
  content = content.replace(
    /^PAYLOAD_SECRET=.*/m,
    `PAYLOAD_SECRET=${secret}`,
  )

  // Replace PREVIEW_SECRET with random value
  const previewSecret = crypto.randomBytes(16).toString('hex')
  content = content.replace(
    /^PREVIEW_SECRET=.*/m,
    `PREVIEW_SECRET=${previewSecret}`,
  )

  // Handle SMTP vars
  if (options.smtp) {
    // Uncomment and fill SMTP lines
    content = content.replace(/^# SMTP_HOST=.*/m, `SMTP_HOST=${options.smtp.host}`)
    content = content.replace(/^# SMTP_PORT=.*/m, `SMTP_PORT=${options.smtp.port}`)
    content = content.replace(/^# SMTP_USER=.*/m, `SMTP_USER=${options.smtp.user}`)
    content = content.replace(/^# SMTP_PASS=.*/m, `SMTP_PASS=${options.smtp.pass}`)
    content = content.replace(/^# SMTP_FROM=.*/m, `SMTP_FROM=${options.smtp.from}`)
    content = content.replace(/^# SMTP_SECURE=.*/m, `SMTP_SECURE=false`)
  }

  fs.writeFileSync(envPath, content, 'utf-8')
  console.log('.env generated successfully.')
}
