/**
 * The message of a failed response: the endpoint's own `{ error }` text when it sent one (the CSS
 * endpoints say what to change in the config), else the status. Client-safe.
 */
export async function responseErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error !== '' ? body.error : `${res.status} ${res.statusText}`
}
