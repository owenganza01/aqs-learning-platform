import { useId, useState } from "react";
import { Button } from "../Button/Button";
import { Skeleton } from "../Skeleton/Skeleton";
import styles from "./BarChart.module.css";
import { scaleBars, type ChartDatum, type ChartUnit } from "./chart-model";

/*
 * Handoff 2, Phase C (task 7-2): one accessible horizontal bar chart, drawn as inline SVG with no chart
 * package. Each row has its label (wraps on narrow screens), a bar and its value on the bar. A table carrying
 * the same numbers is always in the page for screen readers, and "Show as table" shows it to everyone.
 * Colours are tokens: the bar is --color-action (6.7:1 on white, above the 3:1 needed for graphics), values
 * are --color-text (or white inside a long bar). Bars grow in briefly; with reduced motion nothing moves.
 */
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
          className={styles.loading}
          role="status"
          aria-label={`Loading ${title}`}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={20} />
          ))}
        </div>
      ) : bars.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <>
          {asTable ? null : (
            <ul className={styles.rows} aria-hidden="true" data-chart-bars>
              {bars.map((bar) => (
                <li key={bar.label} className={styles.row}>
                  <span className={styles.label}>{bar.label}</span>
                  <svg
                    className={styles.plot}
                    role="presentation"
                    focusable="false"
                  >
                    <rect
                      className={styles.track}
                      x="0"
                      y="2"
                      width="100%"
                      height="20"
                      rx="4"
                    />
                    <rect
                      className={styles.bar}
                      x="0"
                      y="2"
                      width={`${bar.percent}%`}
                      height="20"
                      rx="4"
                      data-value={bar.value}
                    />
                    <text
                      className={
                        bar.valueInside ? styles.valueInside : styles.value
                      }
                      x={
                        bar.valueInside ? `${bar.percent}%` : `${bar.percent}%`
                      }
                      dx={bar.valueInside ? -6 : 6}
                      y="16"
                      textAnchor={bar.valueInside ? "end" : "start"}
                    >
                      {bar.display}
                    </text>
                  </svg>
                </li>
              ))}
            </ul>
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
                {bars.map((bar) => (
                  <tr key={bar.label}>
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
