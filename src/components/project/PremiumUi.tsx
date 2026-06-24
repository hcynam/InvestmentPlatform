import type { CSSProperties, ReactNode } from "react";
import { classNames } from "@/lib/format";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

export function StatusPill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <span className={classNames("finance-status-pill", tone)}>
      {icon ? <i>{icon}</i> : null}
      {children}
    </span>
  );
}

export function GlassPanel({
  children,
  className,
  accent = "info",
}: {
  children: ReactNode;
  className?: string;
  accent?: Tone;
}) {
  return <section className={classNames("glass-panel", `accent-${accent}`, className)}>{children}</section>;
}

export function GlassCard({
  children,
  className,
  accent = "info",
}: {
  children: ReactNode;
  className?: string;
  accent?: Tone;
}) {
  return <article className={classNames("glass-card", `accent-${accent}`, className)}>{children}</article>;
}

export function GlassButton({
  children,
  className,
  variant = "secondary",
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={classNames("glass-button", variant, className)} disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

export function DashboardHeroCard({
  eyebrow,
  title,
  description,
  aside,
  children,
  tone = "accent",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  children?: ReactNode;
  tone?: Tone;
}) {
  return (
    <GlassPanel className="dashboard-hero-card" accent={tone}>
      <header>
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {aside ? <aside>{aside}</aside> : null}
      </header>
      {children}
    </GlassPanel>
  );
}

export function AlignedCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={classNames("aligned-card-grid", className)}>{children}</div>;
}

export const MetricCard = GlassMetricCard;
export const InputCard = GlassCard;
export const LinkedValueCard = GlassCard;
export const StatusBadge = StatusPill;

export function DashboardSection({
  eyebrow,
  title,
  aside,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassPanel className={classNames("dashboard-section", className)}>
      <header className="premium-section-heading">
        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        {aside ? <aside>{aside}</aside> : null}
      </header>
      {children}
    </GlassPanel>
  );
}

export function MiniSparkline({
  values,
  tone = "info",
}: {
  values: number[];
  tone?: Tone;
}) {
  const cleaned = values.map((value) => Number.isFinite(value) ? value : 0);
  const min = Math.min(0, ...cleaned);
  const max = Math.max(1, ...cleaned);
  const points = cleaned.map((value, index) => {
    const x = cleaned.length <= 1 ? 0 : index / (cleaned.length - 1) * 100;
    const y = 36 - ((value - min) / Math.max(1, max - min) * 30 + 3);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg aria-hidden="true" className={classNames("mini-sparkline", tone)} viewBox="0 0 100 40">
      <polyline fill="none" points={points} />
    </svg>
  );
}

export function GlassMetricCard({
  label,
  value,
  note,
  tone = "neutral",
  badge,
  progress,
  sparkline,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
  badge?: ReactNode;
  progress?: number;
  sparkline?: number[];
}) {
  const normalizedProgress = Math.max(0, Math.min(100, Number.isFinite(progress ?? Number.NaN) ? Number(progress) : 0));
  return (
    <article className={classNames("glass-metric-card", tone)}>
      <div className="metric-card-top">
        <span>{label}</span>
        {badge ? <b>{badge}</b> : null}
      </div>
      <strong>{value}</strong>
      {sparkline?.length ? <MiniSparkline values={sparkline} tone={tone} /> : null}
      {progress !== undefined ? (
        <div className="metric-progress" aria-hidden="true">
          <i style={{ "--progress": `${normalizedProgress}%` } as CSSProperties} />
        </div>
      ) : null}
      {note ? <small>{note}</small> : null}
    </article>
  );
}

export function PremiumTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={classNames("table-wrap premium-table-shell", className)}>{children}</div>;
}
