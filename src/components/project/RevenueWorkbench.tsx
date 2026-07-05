"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { classNames, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import {
  buildRevenueWorkbenchModel,
  type RevenueWorkbenchYear,
  type WorkbenchCheck,
  type WorkbenchKpi,
  type WorkbenchSource,
} from "@/lib/revenue-financial-workbench";
import type { Project } from "@/lib/types";
import { useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const statusLabel: Record<WorkbenchCheck["status"], string> = {
  pass: "قبول",
  warning: "نیازمند توجه",
  fail: "خطا",
};

const formatUnitValue = (
  value: number | string | null,
  unit: WorkbenchKpi["unit"] | WorkbenchSource["unit"],
  project: Project,
) => {
  if (typeof value === "string") return value;
  if (unit === "text") return value === null ? "ناموجود" : String(value);
  if (unit === "money") return formatMoney(value, project);
  if (unit === "unitMoney") return value === null ? "ناموجود" : `${formatNumber(value, { maximumFractionDigits: 0 })} ریال`;
  if (unit === "percent") return formatPercent(value);
  if (unit === "ratio") return value === null ? "بدون نسبت" : `${formatNumber(value)}x`;
  return formatNumber(value);
};

function RevenueKpiCard({ kpi, project }: { kpi: WorkbenchKpi; project: Project }) {
  return (
    <article className={classNames("revenue-kpi-card", kpi.tone)}>
      <span>{kpi.label}</span>
      <strong>{formatUnitValue(kpi.value, kpi.unit, project)}</strong>
      <small>{kpi.note}</small>
    </article>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rf-segmented-control" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            className={option.value === value ? "active" : ""}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BarTrend({
  title,
  subtitle,
  rows,
  value,
  formatter,
}: {
  title: string;
  subtitle: string;
  rows: RevenueWorkbenchYear[];
  value: (row: RevenueWorkbenchYear) => number | null;
  formatter: (value: number | null) => string;
}) {
  const values = rows.map(value).filter((item): item is number => item !== null && Number.isFinite(item));
  const max = Math.max(1, ...values.map((item) => Math.abs(item)));
  const sampled = rows.filter((row) => row.year > 0).slice(0, 12);
  return (
    <article className="rf-chart-card">
      <header>
        <div>
          <span>{subtitle}</span>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="rf-bar-chart" role="img" aria-label={`${title} در سال‌های منتخب`}>
        {sampled.map((row) => {
          const current = value(row);
          const height = current === null ? 0 : Math.max(4, Math.abs(current) / max * 100);
          return (
            <div key={row.year} className={classNames(current !== null && current < 0 && "negative")}>
              <i style={{ "--bar": `${height}%` } as CSSProperties} />
              <small>{formatNumber(row.year, { maximumFractionDigits: 0 })}</small>
              <b>{formatter(current)}</b>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DriverBridge({
  model,
  project,
}: {
  model: ReturnType<typeof buildRevenueWorkbenchModel>;
  project: Project;
}) {
  return (
    <section className="panel revenue-driver-panel">
      <div className="panel-heading">
        <div>
          <span>Revenue Driver Bridge</span>
          <strong>{model.isSolar ? "ظرفیت نیروگاه تا درآمد فروش برق" : "تقاضا تا درآمد فروش"}</strong>
        </div>
        <small>ورودی‌ها فقط از تب‌های اصلی خوانده می‌شوند</small>
      </div>
      <div className="revenue-driver-bridge">
        {model.drivers.map((driver, index) => (
          <article key={driver.id}>
            <span>{formatNumber(index + 1, { maximumFractionDigits: 0 })}</span>
            <div>
              <strong>{driver.label}</strong>
              <b>{formatUnitValue(driver.value, driver.unit, project)}</b>
              <small>{driver.sourceLabel}</small>
              <p>{driver.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourcePanel({ sources, project }: { sources: WorkbenchSource[]; project: Project }) {
  return (
    <section className="panel revenue-source-panel">
      <div className="panel-heading">
        <div>
          <span>Assumption provenance</span>
          <strong>منبع مفروضات درآمد</strong>
        </div>
        <small>فقط خواندنی در این صفحه</small>
      </div>
      <div className="revenue-source-grid">
        {sources.map((source) => (
          <article key={source.id}>
            <span>{source.sourceLabel}</span>
            <strong>{source.label}</strong>
            <b>{formatUnitValue(source.value, source.unit, project)}</b>
            <a href={source.editHref}>{source.editLabel}</a>
          </article>
        ))}
      </div>
    </section>
  );
}

function CheckGrid({ checks }: { checks: WorkbenchCheck[] }) {
  return (
    <section className="panel rf-check-panel">
      <div className="panel-heading">
        <div>
          <span>Model checks</span>
          <strong>کنترل منطق درآمد</strong>
        </div>
        <small>{formatNumber(checks.length, { maximumFractionDigits: 0 })} کنترل</small>
      </div>
      <div className="rf-check-grid">
        {checks.map((check) => (
          <article className={check.status} key={check.id}>
            <div>
              <b>{statusLabel[check.status]}</b>
              <span>{check.label}</span>
            </div>
            <strong>{check.message}</strong>
            <small>{check.evidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function RevenueAnnualTable({
  rows,
  basis,
  project,
  volumeUnit,
}: {
  rows: RevenueWorkbenchYear[];
  basis: "nominal" | "real";
  project: Project;
  volumeUnit: string;
}) {
  return (
    <section className="panel wide-panel rf-annual-table-panel">
      <div className="panel-heading">
        <div>
          <span>Annual revenue table</span>
          <strong>جدول سالانه درآمد</strong>
        </div>
        <small>{basis === "real" ? "نمایش درآمد حقیقی" : "نمایش درآمد اسمی"}</small>
      </div>
      <div className="table-wrap xl rf-table-wrap">
        <table className="rf-detail-table">
          <thead>
            <tr>
              <th>سال</th>
              <th>تقاضای بازار</th>
              <th>ظرفیت قابل فروش</th>
              <th>ضریب بهره‌برداری</th>
              <th>مقدار فروش</th>
              <th>قیمت فروش</th>
              <th>رشد قیمت</th>
              <th>درآمد اسمی</th>
              <th>درآمد حقیقی</th>
              <th>سهم داخلی / صادرات</th>
              <th>Gross Margin</th>
              <th>منبع مفروضات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <td>سال {formatNumber(row.year, { maximumFractionDigits: 0 })}</td>
                <td>{formatNumber(row.demand, { maximumFractionDigits: 0 })} {volumeUnit}</td>
                <td>{formatNumber(row.productionCapacity, { maximumFractionDigits: 0 })} {volumeUnit}</td>
                <td>{formatPercent(row.utilization)}</td>
                <td>{formatNumber(row.salesVolume, { maximumFractionDigits: 0 })} {volumeUnit}</td>
                <td>{formatUnitValue(row.salesPrice, "unitMoney", project)}</td>
                <td>{row.priceGrowth === null ? "-" : formatPercent(row.priceGrowth)}</td>
                <td>{formatMoney(row.revenue, project)}</td>
                <td>{formatMoney(row.realRevenue, project)}</td>
                <td>{formatPercent(row.domesticShare)} / {formatPercent(row.exportShare)}</td>
                <td>{formatPercent(row.grossMargin)}</td>
                <td>{row.sourceNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RevenueWorkbench() {
  const { activeScenario, mode, outputs, project } = useProject();
  const [basis, setBasis] = useState<"nominal" | "real">("nominal");
  const [range, setRange] = useState<"operation" | "all">("operation");
  const model = useMemo(
    () => buildRevenueWorkbenchModel(project, activeScenario, outputs),
    [activeScenario, outputs, project],
  );
  const visibleRows = model.rows.filter((row) => range === "all" || row.year > 0);
  const chartRows = visibleRows.filter((row) => row.year > 0);
  const revenueValue = (row: RevenueWorkbenchYear) => basis === "real" ? row.realRevenue : row.revenue;

  return (
    <div className="revenue-workbench rf-workbench">
      <section className="workbench-toolbar rf-toolbar">
        <div>
          <span>{model.isSolar ? "Solar revenue model" : "Revenue model"}</span>
          <h3>{model.isSolar ? "داشبورد درآمد نیروگاه خورشیدی" : "داشبورد درآمد و فروش"}</h3>
          <p>
            درآمد از مسیر تقاضا، ظرفیت، مقدار فروش و قیمت ساخته می‌شود و با صورت سود و زیان کنترل می‌شود.
          </p>
        </div>
        <div className="rf-toolbar-controls">
          <SegmentedControl
            label="مبنای نمایش"
            onChange={setBasis}
            options={[
              { value: "nominal", label: "اسمی" },
              { value: "real", label: "حقیقی" },
            ]}
            value={basis}
          />
          <SegmentedControl
            label="سال‌ها"
            onChange={setRange}
            options={[
              { value: "operation", label: "بهره‌برداری" },
              { value: "all", label: "همه" },
            ]}
            value={range}
          />
        </div>
      </section>

      <section className="rf-context-strip">
        <article>
          <span>سناریوی فعال</span>
          <strong>{model.activeScenarioLabel}</strong>
        </article>
        <article>
          <span>مبنای محاسبه مدل</span>
          <strong>{model.calculationBasis}</strong>
        </article>
        <article>
          <span>واحد حجم</span>
          <strong>{model.volumeUnit}</strong>
        </article>
        <article>
          <span>نوع تفسیر</span>
          <strong>{model.isSolar ? "درآمد فروش برق" : "درآمد فروش محصول"}</strong>
        </article>
      </section>

      <section className="revenue-kpi-grid">
        {model.kpis.slice(0, mode === "advanced" ? model.kpis.length : 8).map((kpi) => (
          <RevenueKpiCard key={kpi.id} kpi={kpi} project={project} />
        ))}
      </section>

      <DriverBridge model={model} project={project} />

      <section className="rf-chart-grid">
        <BarTrend
          formatter={(value) => formatMoney(value, project)}
          rows={chartRows}
          subtitle={basis === "real" ? "Real revenue" : "Nominal revenue"}
          title={basis === "real" ? "روند درآمد حقیقی" : "روند درآمد اسمی"}
          value={revenueValue}
        />
        <BarTrend
          formatter={(value) => `${formatNumber(value, { maximumFractionDigits: 0 })} ${model.volumeUnit}`}
          rows={chartRows}
          subtitle={model.isSolar ? "Sold energy" : "Sales volume"}
          title={model.isSolar ? "انرژی فروخته‌شده" : "حجم فروش"}
          value={(row) => row.salesVolume}
        />
        <BarTrend
          formatter={(value) => formatUnitValue(value, "unitMoney", project)}
          rows={chartRows}
          subtitle={model.isSolar ? "PPA tariff" : "Average selling price"}
          title={model.isSolar ? "تعرفه فروش برق" : "میانگین قیمت فروش"}
          value={(row) => row.salesPrice}
        />
        <BarTrend
          formatter={(value) => formatPercent(value)}
          rows={chartRows}
          subtitle={model.isSolar ? "Capacity factor proxy" : "Utilization"}
          title={model.isSolar ? "ضریب بهره‌برداری نیروگاه" : "ضریب بهره‌برداری"}
          value={(row) => row.utilization}
        />
      </section>

      <section className="panel rf-interpretation-panel">
        <div>
          <UiIcon name="spark" />
          <strong>برداشت مدیریتی</strong>
        </div>
        <p>
          {model.isSolar
            ? "درآمد پروژه از ظرفیت نصب‌شده، ساعات موثر، تولید قابل فروش و تعرفه قرارداد خرید تضمینی ساخته شده است. چون سهم صادرات صفر است، ریسک اصلی درآمد بیشتر به تعرفه، افت تولید و محدودیت پرداخت خریدار وابسته است."
            : "درآمد پروژه از هم‌زمانی تقاضا، ظرفیت قابل فروش، قیمت و رشد قیمت ساخته شده است. هر محدودیت در بازار یا ظرفیت بلافاصله در فروش و صورت سود و زیان دیده می‌شود."}
        </p>
      </section>

      {mode === "advanced" ? <SourcePanel sources={model.sources} project={project} /> : null}
      <CheckGrid checks={model.checks} />
      {mode === "advanced" ? (
        <RevenueAnnualTable basis={basis} project={project} rows={visibleRows} volumeUnit={model.volumeUnit} />
      ) : null}
    </div>
  );
}
