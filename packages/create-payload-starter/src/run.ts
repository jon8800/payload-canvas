import spawn from 'cross-spawn'

/** Runs a command, shows its output, and returns true if it exits with code 0. */
export function run(command: string, args: string[], cwd: string): boolean {
  return spawn.sync(command, args, { cwd, stdio: 'inherit' }).status === 0
}

/** Runs a command and returns its output, or null if it fails. */
export function capture(command: string, args: string[], cwd: string): string | null {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout) : null
}

export function hasCommand(command: string): boolean {
  return spawn.sync(command, ['--version'], { stdio: 'ignore' }).status === 0
}
