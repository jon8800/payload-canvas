import type { CollectionAfterChangeHook } from 'payload'
import nodemailer from 'nodemailer'

type FormEmailConfig = {
  emailTo?: string
  emailFrom?: string
  subject?: string
  message?: string
}

type FormDoc = {
  id: string
  title?: string
  emails?: FormEmailConfig[]
}

type SubmissionField = {
  field: string
  value: string
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
})

export const handleFormEmails: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  try {
    // Fetch the parent form to get email notification settings
    // 'forms' collection is dynamically created by the form-builder plugin
    const formId = typeof doc.form === 'object' ? doc.form.id : doc.form
    const form = (await req.payload.findByID({
      collection: 'forms' as any,
      id: formId,
    })) as unknown as FormDoc

    if (!form?.emails?.length) return doc

    // Build submission data as key-value text
    const submissionData = (doc.submissionData || [])
      .map((field: SubmissionField) => `${field.field}: ${field.value}`)
      .join('\n')

    for (const emailConfig of form.emails) {
      // Replace {{field_name}} placeholders in email subject/body with submission values
      let subject = emailConfig.subject || `New submission: ${form.title}`
      let message = emailConfig.message || submissionData

      for (const field of (doc.submissionData || []) as SubmissionField[]) {
        const placeholder = new RegExp(`\\{\\{${field.field}\\}\\}`, 'g')
        subject = subject.replace(placeholder, field.value || '')
        message = message.replace(placeholder, field.value || '')
      }

      // Determine recipient: use emailTo from config, or fall back to admin email
      const to = emailConfig.emailTo || process.env.ADMIN_EMAIL || ''
      const from = emailConfig.emailFrom || process.env.SMTP_FROM || 'noreply@example.com'

      if (to) {
        await transporter.sendMail({
          from,
          to,
          subject,
          text: message,
          html: `<pre>${message}</pre>`,
        })
      }
    }
  } catch (err) {
    req.payload.logger.error({ err, msg: 'Failed to send form submission email' })
  }

  return doc
}
