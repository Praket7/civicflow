import type { ReactNode } from "react";
import { t } from "../../lib/i18n";
import styles from "./ui.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  caption,
  empty = "Nothing here yet.",
  onRowClick,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  caption: string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  return (
    <div className={[styles.tableWrap, className].filter(Boolean).join(" ")}>
      <table className={`${styles.table} ${onRowClick ? styles.tableClickable : ""}`}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width }}
                className={
                  column.align === "right"
                    ? styles.alignRight
                    : column.align === "center"
                      ? styles.alignCenter
                      : undefined
                }
              >
                {typeof column.header === "string" ? t(column.header) : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.cellMuted}>
                {typeof empty === "string" ? t(empty) : empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      column.align === "right"
                        ? styles.alignRight
                        : column.align === "center"
                          ? styles.alignCenter
                          : undefined
                    }
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
