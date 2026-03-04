import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = process.cwd()
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const skipInstall = process.argv.includes('--skip-install')
const checkMode = process.argv.includes('--check')

const projects = [
  {
    name: 'contracts',
    cwd: resolve(rootDir, 'packages/contracts'),
    installArgs: ['install'],
  },
  {
    name: 'sim',
    cwd: resolve(rootDir, 'apps/sim'),
    installArgs: ['install'],
    devArgs: ['run', 'dev'],
  },
  {
    name: 'web',
    cwd: resolve(rootDir, 'apps/web'),
    installArgs: ['install'],
    devArgs: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
  },
]

const relayOutput = (targetName, stream, chunk) => {
  if (!stream.writable) {
    return
  }

  const text = chunk.toString()
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (line.length === 0) {
      continue
    }
    try {
      stream.write(`[${targetName}] ${line}\n`)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EPIPE') {
        return
      }
      throw error
    }
  }
}

const runForegroundCommand = (targetName, cwd, args) =>
  new Promise((resolveExit) => {
    const child = spawn(npmCommand, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    child.stdout.on('data', (chunk) => relayOutput(targetName, process.stdout, chunk))
    child.stderr.on('data', (chunk) => relayOutput(targetName, process.stderr, chunk))

    child.on('close', (code) => {
      resolveExit(code ?? 1)
    })

    child.on('error', (error) => {
      process.stderr.write(`[${targetName}] ${String(error)}\n`)
      resolveExit(1)
    })
  })

const ensureDependencies = async () => {
  for (const project of projects) {
    const nodeModulesPath = resolve(project.cwd, 'node_modules')
    if (skipInstall || existsSync(nodeModulesPath)) {
      continue
    }

    process.stdout.write(`[setup] Installing dependencies for ${project.name}...\n`)
    const exitCode = await runForegroundCommand(project.name, project.cwd, project.installArgs)
    if (exitCode !== 0) {
      process.stderr.write(`[setup] Failed to install dependencies for ${project.name}.\n`)
      process.exit(exitCode)
    }
  }
}

const launchDevServers = async () => {
  await ensureDependencies()

  process.stdout.write('[setup] Starting simulator and web app...\n')
  process.stdout.write('[setup] Web: http://127.0.0.1:5173\n')
  process.stdout.write('[setup] WS: ws://localhost:8090 | Replay API: http://localhost:8091\n')
  process.stdout.write('[setup] Press Ctrl+C to stop all services.\n')
  if (checkMode) {
    process.stdout.write('[setup] Check mode enabled: services will be auto-stopped after startup verification.\n')
  }

  const runningChildren = new Set()
  let shuttingDown = false
  let failureCode = 0
  const expectedDevProcessCount = projects.filter((project) => project.devArgs).length

  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    failureCode = failureCode || code

    for (const child of runningChildren) {
      if (!child.killed) {
        child.kill()
      }
    }

    setTimeout(() => {
      process.exit(failureCode)
    }, 250).unref()
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  for (const project of projects) {
    if (!project.devArgs) {
      continue
    }

    const child = spawn(npmCommand, project.devArgs, {
      cwd: project.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    runningChildren.add(child)

    child.stdout.on('data', (chunk) => relayOutput(project.name, process.stdout, chunk))
    child.stderr.on('data', (chunk) => relayOutput(project.name, process.stderr, chunk))

    child.on('close', (code) => {
      runningChildren.delete(child)
      if (shuttingDown) {
        if (runningChildren.size === 0) {
          process.exit(failureCode)
        }
        return
      }

      const exitCode = code ?? 1
      if (exitCode !== 0) {
        process.stderr.write(`[setup] ${project.name} exited with code ${exitCode}.\n`)
        shutdown(exitCode)
      } else if (runningChildren.size === 0) {
        process.exit(0)
      }
    })

    child.on('error', (error) => {
      process.stderr.write(`[setup] Failed to start ${project.name}: ${String(error)}\n`)
      shutdown(1)
    })
  }

  if (checkMode) {
    setTimeout(() => {
      if (runningChildren.size === expectedDevProcessCount) {
        process.stdout.write('[check] Simulator and web app are both running.\n')
        shutdown(0)
        return
      }

      process.stderr.write(
        `[check] Startup verification failed: expected ${expectedDevProcessCount} processes, got ${runningChildren.size}.\n`,
      )
      shutdown(1)
    }, 6000).unref()
  }
}

await launchDevServers()
