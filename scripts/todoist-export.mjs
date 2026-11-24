#!/usr/bin/env node
// Read-only Todoist export -> fixtures/private/{todoist-export,corpus}.json
// Run: node --env-file=.env.local scripts/todoist-export.mjs
// GET-only. Never logs headers/errors from requests (token safety).
import { mkdir, writeFile } from "node:fs/promises"

const BASE = "https://api.todoist.com/api/v1"
const OUT = new URL("../fixtures/private/", import.meta.url)
const token = process.env.TODOIST_PERSONAL_TOKEN
if (!token) { console.error("TODOIST_PERSONAL_TOKEN missing"); process.exit(1) }

// GET with redirect refusal; error text never includes headers/token
const get = async (path, params = {}) => {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v)

  const res = await fetch(url, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

// follow next_cursor; tolerate bare-array responses
const all = async (path, params = {}) => {
  const items = []
  let cursor
  do {
    const page = await get(path, { limit: 200, ...params, cursor })
    items.push(...(Array.isArray(page) ? page : page.results ?? page.items ?? []))
    cursor = Array.isArray(page) ? null : page.next_cursor
  } while (cursor)
  return items
}

const day = 864e5
const until = new Date()
const since = new Date(until - 89 * day) // endpoint caps range at ~3 months

const [projects, sections, labels, tasks, completed] = await Promise.all([
  all("/projects"),
  all("/sections"),
  all("/labels"),
  all("/tasks"),
  all("/tasks/completed/by_completion_date", { since: since.toISOString(), until: until.toISOString() })
    .catch((e) => { console.error("completed skipped:", e.message); return [] }),
])

const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]))
const row = (t) => ({
  content: t.content,
  due: t.due && {
    string: t.due.string,
    date: t.due.date,
    is_recurring: t.due.is_recurring,
    datetime: t.due.datetime ?? null,
    timezone: t.due.timezone ?? null,
  },
  deadline: t.deadline ?? null,
  priority: t.priority,
  labels: t.labels ?? [],
  project_name: projectName[t.project_id] ?? null,
})

await mkdir(OUT, { recursive: true })
await writeFile(new URL("todoist-export.json", OUT), JSON.stringify({ fetched_at: until.toISOString(), projects, sections, labels, tasks, completed }, null, 2))
await writeFile(new URL("corpus.json", OUT), JSON.stringify([...tasks, ...completed].map(row), null, 2))

console.log({ projects: projects.length, sections: sections.length, labels: labels.length, tasks: tasks.length, completed: completed.length })
