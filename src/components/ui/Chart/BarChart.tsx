import { lazy, Suspense, useId, useState } from "react";
import { Button } from "../Button/Button";
import { Skeleton } from "../Skeleton/Skeleton";
import styles from "./BarChart.module.css";
import { scaleBars, type ChartDatum, type ChartUnit } from "./chart-model";

/*
 * Handoff 2, Phase C (task 7-2), redrawn for C4 (owner decision, 23 November 2026): one accessible
 * horizontal bar chart. The bars are drawn by Recharts (SVG) in BarChartPlot.tsx, which is loaded only when a
 * chart is on screen, so the library never weighs on pages without one. This shell keeps everything else:
 * title, "Show as table", the loading skeleton, the empty message and the table alternative, which is always
 * in the page for screen readers. Colours are tokens: the bar is --color-action (6.7:1 on white, above the
 * 3:1 needed for graphics), values are --color-text (or white inside a long bar). With reduced motion
 * nothing moves.
 */
const BarChartPlot = lazy(() => import("./BarChartPlot"));
export type BarChartProps = {
  /** What the chart shows, e.g. "Completion by course". */
  title: string;
  /** One line under the title, e.g. "Sample data · not real figures". */
  description?: string;
  data: ChartDatum[];
  /** "percent" shows 45%, scaled to 100 unless `max` is given; "count" shows 1,240. */
  unit?: ChartUnit;
  /** The value a full-width bar stands for. Defaults to 100 for percentages, else the largest value. */
  max?: number;
  /** Column headings of the table alternative. */
  labelHeading?: string;
  valueHeading?: string;
  loading?: boolean;
  /** Shown when there is nothing to chart. */
  emptyMessage?: string;
};

export function BarChart({
  title,
  description,
  data,
  unit = "count",
  max,
  labelHeading = "Item",
  valueHeading = "Value",
  loading = false,
  emptyMessage = "Nothing to show yet.",
}: BarChartProps) {
  const id = useId();
  const [asTable, setAsTable] = useState(false);
  const bars = scaleBars(
    data,
    unit,
    max ?? (unit === "percent" ? 100 : undefined),
  );
  const titleId = `${id}-title`;
  const tableId = `${id}-table`;

  return (
    <figure className={styles.chart} aria-labelledby={titleId}>
      <div className={styles.head}>
        <figcaption>
          <span id={titleId} className={styles.title}>
            {title}
          </span>
          {description ? (
            <span className={styles.description}>{description}</span>
          ) : null}
        </figcaption>
        {!loading && bars.length > 0 ? (
          <Button
            variant="text"
            size="sm"
            aria-controls={tableId}
            aria-expanded={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? "Show as chart" : "Show as table"}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div
          role="status"
          aria-label={`Loading ${title}`}
        >
          <ChartSkeleton rows={3} />
        </div>
      ) : bars.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <>
          {asTable ? null : (
            <Suspense fallback={<ChartSkeleton rows={bars.length} />}>
              <BarChartPlot bars={bars} valueHeading={valueHeading} />
            </Suspense>
          )}
          {/* Hidden by its wrapper: a table ignores the 1 px width of .visually-hidden and would widen the page. */}
          <div id={tableId} className={asTable ? undefined : "visually-hidden"}>
            <table className={styles.table}>
              <caption className="visually-hidden">{title}</caption>
              <thead>
                <tr>
                  <th scope="col">{labelHeading}</th>
                  <th scope="col">{valueHeading}</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar, i) => (
                  <tr key={`${i}-${bar.label}`}>
                    <th scope="row">{bar.label}</th>
                    <td>{bar.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </figure>
  );
}

/** Grey rows standing in for the bars while the figures or the chart library load. */
function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.loading} aria-hidden="true">
      {Array.from({ length: Math.max(1, rows) }, (_, i) => (
        <Skeleton key={i} height={20} />
      ))}
    </div>
  );
}
