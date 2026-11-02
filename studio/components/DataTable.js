'use client';
// Premium data table on Untitled UI's Table + Pagination (React Aria).
// columns: [{ key, label, render?(row), rowHeader? }] — render wins over row[key].
import { useState } from 'react';
import { Table, TableCard } from '@/components/untitledui/application/table/table';
import { PaginationPageDefault } from '@/components/untitledui/application/pagination/pagination';
import { EmptyState } from '@/components/ui';

export default function DataTable({ label, columns, rows, pageSize = 10, emptyIcon, emptyTitle = 'Nothing here', emptySub = '' }) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, total);
  const slice = rows.slice((p - 1) * pageSize, p * pageSize);

  if (!rows.length) return <EmptyState icon={emptyIcon} title={emptyTitle} sub={emptySub} />;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border-tertiary">
        <Table aria-label={label}>
          <Table.Header>
            {columns.map((c) => (
              <Table.Head key={c.key} id={c.key} label={c.label} isRowHeader={Boolean(c.rowHeader)} />
            ))}
          </Table.Header>
          <Table.Body items={slice}>
            {(row) => (
              <Table.Row id={String(row.id != null ? row.id : '')}>
                {columns.map((c) => (
                  <Table.Cell key={c.key}>{c.render ? c.render(row) : row[c.key]}</Table.Cell>
                ))}
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>
      {rows.length > pageSize ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px] text-fg-quaternary tnum">{rows.length} entries</span>
          <PaginationPageDefault page={p} total={total} onPageChange={setPage} rounded />
        </div>
      ) : (
        <div className="mt-3 text-[11.5px] text-fg-quaternary tnum">{rows.length} entries</div>
      )}
    </div>
  );
}
