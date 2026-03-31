interface ComparisonTableProps {
  headers: string[];
  rows: string[][];
  title?: string;
  caption?: string;
}

export function ComparisonTable({ headers, rows, title, caption }: ComparisonTableProps) {
  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm overflow-x-auto">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 font-semibold text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3 text-muted-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
