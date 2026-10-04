import spawn from 'cross-spawn'

/** Runs a command, shows its output, and returns true if it exits with code 0. */
export function run(command: string, args: string[], cwd: string): boolean {
  return spawn.sync(command, args, { cwd, stdio: 'inherit' }).status === 0
}

/** Runs a command and returns its output. On failure it returns null and the error text. */
export function capture(
  command: string,
  args: string[],
  cwd: string,
): { ok: true; stdout: string } | { ok: false; error: string } {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8' })
  if (result.status === 0) return { ok: true, stdout: String(result.stdout) }
  const error = result.error?.message ?? (String(result.stderr).trim() || `exit code ${result.status}`)
  return { ok: false, error }
}

export function hasCommand(command: string): boolean {
  return spawn.sync(command, ['--version'], { stdio: 'ignore' }).status === 0
}
