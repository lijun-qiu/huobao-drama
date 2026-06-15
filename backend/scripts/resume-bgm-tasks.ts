import { resumePendingBgmTasks } from '../src/services/bgm-generation.js'

console.log('Resuming pending BGM tasks...')
resumePendingBgmTasks()

// Keep process alive while async downloads finish
setTimeout(() => {
  console.log('Done waiting.')
  process.exit(0)
}, 180_000)
