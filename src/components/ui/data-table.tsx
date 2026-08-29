'use client'

import * as React from 'react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'
import { Input } from './input'
import { SkeletonTable } from './skeleton'
import { EmptyState, ErrorState, NoResultsState } from './states'

/**
 * The one table in the product.
 *
 * Data density scales with the screen, and the two layouts are genuinely
 * different components rather than one squeezed:
 *
 *   Desktop (md+)  — the full sortable table.
 *   Mobile (<md)   — stacked cards showing only what drives the decision,
 *                    rendered by the caller through `renderMobileCard`.
 *
 * `renderMobileCard` is required, not optional. A horizontally scrolling table
 * on a phone is the single easiest way to break the "no horizontal scrolling,
 * ever" rule, so the API does not let you forget the small layout.
 */

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  /** The mobile layout for one row. Required — see the note above. */
  renderMobileCard: (row: T, index: number) => React.ReactNode
  /** Stable key per row; falls back to the array index. */
  getRowId?: (row: T, index: number) => string

  loading?: boolean
  error?: unknown
  onRetry?: () => void

  /** Shows the search box and filters across every column. */
  searchable?: boolean
  searchPlaceholder?: string

  /** 0 disables pagination and renders every row. */
  pageSize?: number

  onRowClick?: (row: T) => void
  /** Accessible label for the table. */
  caption: string

  /** Shown when there is genuinely no data (as opposed to no search matches). */
  emptyTitle?: string
  emptyDescription?: React.ReactNode
  emptyAction?: React.ReactNode

  /**
   * Pins the first column while the rest scrolls — the tablet behaviour, so
   * the applicant's name stays visible next to whichever figure is on screen.
   */
  stickyFirstColumn?: boolean

  className?: string
}

export function DataTable<T>({
  data,
  columns,
  renderMobileCard,
  getRowId,
  loading = false,
  error,
  onRetry,
  searchable = false,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  onRowClick,
  caption,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  stickyFirstColumn = false,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  // React Compiler declines to auto-memoize this component because
  // `useReactTable` returns fresh function identities each render. That is
  // expected and safe here — the table is small and re-rendering it is cheap.
  // The lint warning is informational, not a defect.
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize > 0 ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: pageSize > 0 ? { pagination: { pageSize, pageIndex: 0 } } : undefined,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  const isFiltered = globalFilter.trim().length > 0

  if (error) {
    return (
      <div className={cn('rounded-xl border border-border bg-surface shadow-e1', className)}>
        <ErrorState onRetry={onRetry} error={error} />
      </div>
    )
  }

  if (loading) {
    return <SkeletonTable className={className} rows={Math.min(pageSize || 6, 6)} columns={columns.length} />
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {searchable && (
        <Input
          type="search"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          label={`Search ${caption}`}
          labelHidden
          leadingIcon={<Search />}
          containerClassName="sm:max-w-xs"
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-e1">
          {isFiltered ? (
            <NoResultsState onClear={() => setGlobalFilter('')} />
          ) : (
            <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
          )}
        </div>
      ) : (
        <>
          {/* ---------- Desktop / tablet: the real table ---------- */}
          <div
            className={cn(
              'hidden min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-e1 md:block',
            )}
          >
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-border bg-surface-sunken">
                      {headerGroup.headers.map((header, i) => {
                        const canSort = header.column.getCanSort()
                        const sorted = header.column.getIsSorted()
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={
                              sorted === 'asc'
                                ? 'ascending'
                                : sorted === 'desc'
                                  ? 'descending'
                                  : canSort
                                    ? 'none'
                                    : undefined
                            }
                            className={cn(
                              'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                              stickyFirstColumn &&
                                i === 0 &&
                                'sticky left-0 z-10 bg-surface-sunken lg:static',
                            )}
                          >
                            {header.isPlaceholder ? null : canSort ? (
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 py-1 uppercase transition-colors hover:text-foreground"
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {sorted === 'asc' ? (
                                  <ChevronUp className="size-3.5" aria-hidden="true" />
                                ) : sorted === 'desc' ? (
                                  <ChevronDown className="size-3.5" aria-hidden="true" />
                                ) : (
                                  <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                                )}
                              </button>
                            ) : (
                              flexRender(header.column.columnDef.header, header.getContext())
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onRowClick(row.original)
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        'border-b border-border transition-colors last:border-0',
                        onRowClick && 'cursor-pointer hover:bg-accent focus-visible:bg-accent',
                      )}
                    >
                      {row.getVisibleCells().map((cell, i) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-4 py-3.5 align-middle',
                            stickyFirstColumn &&
                              i === 0 &&
                              'sticky left-0 z-10 bg-surface font-medium lg:static',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------- Mobile: stacked cards ---------- */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
            {rows.map((row, i) => (
              <li key={row.id}>
                {onRowClick ? (
                  <button
                    type="button"
                    onClick={() => onRowClick(row.original)}
                    className="w-full rounded-xl text-left transition-transform active:scale-[0.995] motion-reduce:active:scale-100"
                  >
                    {renderMobileCard(row.original, i)}
                  </button>
                ) : (
                  renderMobileCard(row.original, i)
                )}
              </li>
            ))}
          </ul>

          {pageSize > 0 && table.getPageCount() > 1 && (
            <Pagination table={table} />
          )}
        </>
      )}
    </div>
  )
}

function Pagination<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const total = table.getFilteredRowModel().rows.length
  const pageSize = table.getState().pagination.pageSize
  const from = pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, total)

  return (
    <nav
      aria-label="Table pagination"
      className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          leadingIcon={<ChevronLeft className="size-4" />}
        >
          Previous
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          trailingIcon={<ChevronRight className="size-4" />}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
