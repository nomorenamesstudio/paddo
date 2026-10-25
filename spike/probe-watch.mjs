import { appendFileSync } from 'node:fs'

import chokidar from 'chokidar'

const target = 'content/the-quiet-interface.md'
const watcher = chokidar.watch('content', {
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 60 },
})
const pollWatcher = chokidar.watch('content', {
  ignoreInitial: true,
  depth: 0,
  usePolling: true,
  interval: 200,
})

let events = 0
watcher.on('all', (event, path) => {
  events += 1
  console.log('native:', event, path)
})
pollWatcher.on('all', (event, path) => {
  events += 1
  console.log('polling:', event, path)
})

setTimeout(() => appendFileSync(target, 'probe line\n'), 800)
setTimeout(async () => {
  console.log('events seen:', events)
  await watcher.close()
  await pollWatcher.close()
  process.exit(0)
}, 3000)
