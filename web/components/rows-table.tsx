import type { Row } from '@/lib/types';

/** Tabular preview; values are rendered as text (React escapes them). */
export function RowsTable({ columns, rows }: { columns: string[]; rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{row[column] === null || row[column] === undefined ? '' : String(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
