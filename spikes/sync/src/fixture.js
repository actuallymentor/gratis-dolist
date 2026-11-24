// Plan §2.1 schema (subset relevant to sync) + deterministic 10k-task fixture.
// Shared by the browser bench and the Node WS clients.

export const tablesSchema = {
  tasks: {
    title:        { type: 'string' },
    notes:        { type: 'string' },
    project_id:   { type: 'string' },   // '' = Inbox (TinyBase has no null cells)
    parent_id:    { type: 'string' },
    priority:     { type: 'number' },
    scheduled:    { type: 'string' },   // floating date YYYY-MM-DD
    time:         { type: 'string' },
    tz:           { type: 'string' },
    duration:     { type: 'number' },
    deadline:     { type: 'string' },
    recur:        { type: 'string' },   // JSON, edited as a unit
    created_at:   { type: 'number' },
    completed_at: { type: 'number' },
    deleted_at:   { type: 'number' },
    literal_mask: { type: 'string' },
  },
  task_labels: { on: { type: 'boolean' } },
  completions: { at: { type: 'number' }, device: { type: 'string' } },
  orders:      { rank: { type: 'string' } },
  meta:        { version: { type: 'number' }, min_client: { type: 'number' } },
}


// Tiny seeded PRNG so every run produces the same fixture
const rng = (seed = 42) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}

// uuid v7-ish: 48-bit ms timestamp + random tail
const uuid7 = (ms, rand) => {
  const hex = n => Math.floor(rand() * 16 ** n).toString(16).padStart(n, '0')
  const ts  = ms.toString(16).padStart(12, '0')
  return `${ts.slice(0, 8)}-${ts.slice(8)}-7${hex(3)}-${(8 + Math.floor(rand() * 4)).toString(16)}${hex(3)}-${hex(12)}`
}

const WORDS = 'buy call email fix plan review write ship draft book pay renew clean sort read sketch test deploy refactor water'.split(' ')
const NOUNS = 'milk invoice report garden car tax slides dentist roadmap budget kitchen tickets backlog plants newsletter contract'.split(' ')


/**
 * Build a full Content tuple [tables, values] with `n` tasks.
 * Roughly: 30% scheduled, 15% timed, 40% labelled, 10% recurring w/ completions, 20% notes.
 */
export const generate = (n = 10_000, seed = 42) => {
  const rand  = rng(seed)
  const pick  = arr => arr[Math.floor(rand() * arr.length)]
  const start = Date.UTC(2026, 0, 1)

  const projects = Array.from({ length: 12 }, (_, i) => `proj-${i}`)
  const labels   = Array.from({ length: 20 }, (_, i) => `label-${i}`)

  const tasks = {}, task_labels = {}, completions = {}, orders = {}
  const ids = []

  for (let i = 0; i < n; i++) {
    const created = start + i * 60_000
    const id      = uuid7(created, rand)
    const project = rand() < 0.3 ? '' : pick(projects)
    ids.push(id)

    const task = {
      title:      `${pick(WORDS)} ${pick(NOUNS)} ${i}`,
      project_id: project,
      priority:   Math.floor(rand() * 4) + 1,
      created_at: created,
    }

    if (rand() < 0.2)  task.notes     = 'Some notes about this task, a sentence or two long.'
    if (rand() < 0.3)  task.scheduled = `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`
    if (rand() < 0.15) Object.assign(task, { time: '09:30', tz: 'Europe/Amsterdam', duration: 30 })
    if (rand() < 0.05) task.deadline  = '2026-12-31'
    if (rand() < 0.05 && i > 0) task.parent_id = ids[i - 1 - Math.floor(rand() * Math.min(i, 50))]
    if (rand() < 0.25) task.completed_at = created + 86_400_000

    // Recurring tasks carry completion rows
    if (rand() < 0.1) {
      task.recur = JSON.stringify({ freq: 'weekly', interval: 1, byday: ['mo'], anchor: 'schedule' })
      for (let w = 0; w < 5; w++) {
        const day = new Date(start + w * 7 * 86_400_000).toISOString().slice(0, 10)
        completions[`${id}:${day}`] = { at: start + w * 7 * 86_400_000, device: 'seed' }
      }
    }

    if (rand() < 0.4) {
      const count = 1 + Math.floor(rand() * 3)
      for (let l = 0; l < count; l++) task_labels[`${id}:${pick(labels)}`] = { on: true }
    }

    tasks[id] = task
    orders[`${project || 'inbox'}:${id}`] = { rank: `a${i.toString(36).padStart(4, '0')}` }
  }

  const meta = { schema: { version: 1, min_client: 1 } }
  return { content: [{ tasks, task_labels, completions, orders, meta }, {}], ids }
}
