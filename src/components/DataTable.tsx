import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  pageSize?: number;
  searchPlaceholder?: string;
  globalFilter?: string;
  onGlobalFilterChange?: (v: string) => void;
}

export default function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  searchPlaceholder = 'Buscar...',
  globalFilter,
  onGlobalFilterChange,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [localFilter, setLocalFilter] = useState('');

  const filter = globalFilter ?? localFilter;
  const setFilter = onGlobalFilterChange ?? setLocalFilter;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter: filter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-3 min-w-0">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={searchPlaceholder}
        className="input w-full sm:max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 -mx-1 px-1 sm:mx-0 sm:px-0 touch-pan-x">
        <table className="w-full text-sm min-w-[640px] sm:min-w-0">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-2 py-2 sm:px-4 sm:py-3 text-left font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-gray-400">
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp size={14} />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronsUpDown size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-2 sm:px-4 sm:py-3 text-gray-700 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
        <span className="tabular-nums">
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} —{' '}
          {table.getFilteredRowModel().rows.length} registros
        </span>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-2 rounded border disabled:opacity-40 hover:bg-gray-100 touch-manipulation"
            aria-label="Página anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-2 rounded border disabled:opacity-40 hover:bg-gray-100 touch-manipulation"
            aria-label="Próxima página"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
