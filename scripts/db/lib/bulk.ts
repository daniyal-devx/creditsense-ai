import type { Client, PoolClient } from 'pg'

type Executor = Client | PoolClient

/**
 * Insert many rows with as few round trips as possible.
 *
 * Postgres caps a single statement at 65535 bind parameters, so the batch size
 * is derived from the column count rather than fixed. Inserting row-by-row
 * over a pooled connection to a database in another region would turn a
 * 40,000-row seed into tens of thousands of network round trips.
 */
export async function bulkInsert(
  client: Executor,
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
  options: { onConflict?: string } = {},
): Promise<number> {
  if (rows.length === 0) return 0

  const maxParams = 60_000
  const rowsPerBatch = Math.max(1, Math.floor(maxParams / columns.length))
  const columnList = columns.map((c) => `"${c}"`).join(', ')
  const conflict = options.onConflict ? ` ${options.onConflict}` : ''

  let inserted = 0

  for (let offset = 0; offset < rows.length; offset += rowsPerBatch) {
    const batch = rows.slice(offset, offset + rowsPerBatch)
    const params: unknown[] = []
    const tuples: string[] = []

    for (const row of batch) {
      if (row.length !== columns.length) {
        throw new Error(
          `bulkInsert(${table}): row has ${row.length} values but ${columns.length} columns were declared`,
        )
      }
      const placeholders = row.map((value) => {
        params.push(value)
        return `$${params.length}`
      })
      tuples.push(`(${placeholders.join(', ')})`)
    }

    const sql = `insert into ${table} (${columnList}) values ${tuples.join(', ')}${conflict}`
    const result = await client.query(sql, params)
    inserted += result.rowCount ?? batch.length
  }

  return inserted
}

/** A small progress line that overwrites itself rather than flooding the log. */
export function progress(label: string, current: number, total: number): void {
  const pct = total === 0 ? 100 : Math.round((current / total) * 100)
  const width = 24
  const filled = Math.round((pct / 100) * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  process.stdout.write(`\r  ${label.padEnd(22)} ${bar} ${String(pct).padStart(3)}%`)
  if (current >= total) process.stdout.write('\n')
}
