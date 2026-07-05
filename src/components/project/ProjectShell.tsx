"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney, formatNumber } from "@/lib/format";
import { moduleConfigs, navigationForMode } from "@/lib/module-config";
import type { ValidationIssue } from "@/lib/types";
import { ProjectProvider, useProject } from "@/store/project-context";
import { UiIcon } from "@/components/project/UiIcon";

const groupIcon = (group: string) => {
  if (group.includes("داشبورد")) return "dashboard" as const;
  if (group.includes("پروژه")) return "assumptions" as const;
  if (group.includes("سناریو")) return "scenario" as const;
  return "results" as const;
};

const moduleTitle = (slug: string) => moduleConfigs.find((item) => item.slug === slug)?.title ?? slug;

const issueRecommendation = (issue: ValidationIssue) => {
  if (issue.id.startsWith("statements.balance-")) {
    return "جریان نقد، بدهی کوتاه‌مدت ضمنی، سرمایه در گردش، بازپرداخت بدهی و سیاست تقسیم سود را بازبینی کنید.";
  }
  return issue.recommendation ?? issue.impact ?? "برای بررسی بیشتر به ماژول مربوطه بروید.";
};

function TopCommandBar({ issuesOpen, onToggleIssues }: { issuesOpen: boolean; onToggleIssues: () => void }) {
  const {
    project,
    activeScenario,
    outputs,
    mode,
    dirty,
    setMode,
    runCalculation,
    selectScenario,
  } = useProject();
  const errorCount = outputs.validations.filter((issue) => issue.severity === "error").length;
  const warningCount = outputs.validations.filter((issue) => issue.severity === "warning").length;

  return (
    <header className="app-header">
      <div className="header-identity">
        <div className="workspace-mark">IP</div>
        <div>
          <small>{project.code}</small>
          <strong>{project.name}</strong>
        </div>
      </div>

      <div className="header-context">
        <label className="scenario-switcher premium-scenario-switcher">
          <span><i className={dirty ? "scenario-dot warning" : "scenario-dot success"} />سناریوی فعال</span>
          <select value={activeScenario.id} onChange={(event) => selectScenario(event.target.value)}>
            {[...project.scenarios].sort((left, right) => left.priority - right.priority).map((scenario) => (
              <option key={scenario.id} value={scenario.id} disabled={scenario.status === "inactive"}>
                {scenario.code} · {scenario.name}{scenario.status === "inactive" ? " · غیرفعال" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className={dirty ? "header-status-pill warning" : "header-status-pill success"}>
          {dirty ? "نیازمند محاسبه" : "مدل به‌روز"}
        </div>
      </div>

      <div className="header-actions">
        <div className="mode-toggle" role="group" aria-label="سطح نمایش">
          <button className={mode === "basic" ? "active" : ""} onClick={() => setMode("basic")} type="button">
            ساده
          </button>
          <button className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")} type="button">
            پیشرفته
          </button>
        </div>
        <button
          className={issuesOpen ? "issues-button active" : "issues-button"}
          onClick={onToggleIssues}
          type="button"
          aria-label={issuesOpen ? "بستن خطاها و هشدارها" : "نمایش خطاها و هشدارها"}
        >
          <UiIcon name="issues" />
          <span>{formatNumber(errorCount + warningCount)}</span>
        </button>
        <button className={dirty ? "primary-button attention" : "primary-button"} onClick={runCalculation} type="button">
          {dirty ? "اعمال و محاسبه" : "محاسبه مجدد"}
        </button>
      </div>
    </header>
  );
}

function ProjectSummaryRail() {
  const { project, activeScenario, outputs, dirty } = useProject();
  const operationYear = project.operationStartDate.slice(0, 4);
  return (
    <aside className="project-summary-rail">
      <div className="summary-brand">
        <span>خلاصه پروژه</span>
        <strong>{project.companyName}</strong>
        <small>{project.industry} / {project.subIndustry}</small>
      </div>

      <div className="health-score">
        <div
          className="score-ring"
          style={{ "--score": `${outputs.dashboards.projectHealthScore * 3.6}deg` } as React.CSSProperties}
        >
          <strong>{formatNumber(outputs.dashboards.projectHealthScore)}</strong>
        </div>
        <div>
          <span>سلامت مدل</span>
          <small>{outputs.dashboards.recommendation}</small>
        </div>
      </div>

      <dl className="summary-list">
        <div><dt>سناریو</dt><dd>{activeScenario.name}</dd></div>
        <div><dt>وضعیت</dt><dd className={dirty ? "text-warning" : "text-success"}>{dirty ? "تغییر ذخیره‌نشده" : "به‌روز"}</dd></div>
        <div><dt>NPV</dt><dd>{formatMoney(outputs.valuation.npv, project)}</dd></div>
        <div><dt>شروع بهره‌برداری</dt><dd>{operationYear}</dd></div>
        <div><dt>افق مدل</dt><dd>{formatNumber(project.modelHorizonYears)} سال</dd></div>
      </dl>

      <div className="summary-progress">
        <div><span>آمادگی سرمایه‌گذاری</span><strong>{formatNumber(outputs.dashboards.investmentReadinessScore)}٪</strong></div>
        <progress max="100" value={outputs.dashboards.investmentReadinessScore} />
        <div><span>بانک‌پذیری</span><strong>{formatNumber(outputs.dashboards.bankabilityScore)}٪</strong></div>
        <progress max="100" value={outputs.dashboards.bankabilityScore} />
      </div>

      <Link className="summary-settings" href={`/projects/${project.id}/settings`}>
        <UiIcon name="settings" size={16} />
        تنظیمات فضای کاری
      </Link>
    </aside>
  );
}

function ProjectNavigation() {
  const pathname = usePathname();
  const { project, mode } = useProject();
  const groups = navigationForMode(mode);
  const current = moduleConfigs.find((item) => pathname.endsWith(item.route));

  return (
    <aside className="project-navigation">
      <div className="nav-heading">
        <div>
          <span>فضای کار</span>
          <strong>{current?.title ?? "پروژه"}</strong>
        </div>
        <small>{mode === "basic" ? "مسیر هدایت‌شده" : "مدل کامل"}</small>
      </div>

      <div className="nav-scroll">
        {groups.map((group) => (
          <section key={group.group} className="nav-section">
            <h2><UiIcon name={groupIcon(group.group)} size={16} />{group.group}</h2>
            <nav>
              {group.items.map((item) => {
                const href = `/projects/${project.id}${item.route}`;
                const active = pathname === href;
                return (
                  <Link href={href} prefetch key={item.slug} className={active ? "active" : ""}>
                    <span>{item.title}</span>
                    {item.status === "warning" ? <i className="nav-status warning" title="نیازمند توجه" /> : null}
                    {active ? <UiIcon name="chevron" size={15} /> : null}
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}
      </div>

      {mode === "basic" ? (
        <div className="nav-hint">
          <UiIcon name="spark" size={17} />
          برای جداول، ریسک و کنترل‌های تخصصی حالت پیشرفته را فعال کنید.
        </div>
      ) : null}
    </aside>
  );
}

function ValidationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { outputs } = useProject();
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  useEffect(() => {
    if (!open) return undefined;
    const closeOnNativeEvent = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-close-validation]")) onClose();
    };
    document.addEventListener("click", closeOnNativeEvent, true);
    document.addEventListener("mousedown", closeOnNativeEvent, true);
    return () => {
      document.removeEventListener("click", closeOnNativeEvent, true);
      document.removeEventListener("mousedown", closeOnNativeEvent, true);
    };
  }, [onClose, open]);
  const counts = {
    error: outputs.validations.filter((issue) => issue.severity === "error").length,
    warning: outputs.validations.filter((issue) => issue.severity === "warning").length,
    info: outputs.validations.filter((issue) => issue.severity === "info").length,
  };
  const issues = filter === "all"
    ? outputs.validations
    : outputs.validations.filter((issue) => issue.severity === filter);

  return (
    <>
      <button
        aria-label="بستن پوشش پنل بررسی مدل"
        className={open ? "drawer-backdrop visible" : "drawer-backdrop"}
        data-close-validation
        onClick={onClose}
        onMouseDown={onClose}
        type="button"
      />
      <button
        aria-label="بستن پنل بررسی مدل"
        className={open ? "drawer-floating-close visible" : "drawer-floating-close"}
        data-close-validation
        onClick={onClose}
        onMouseDown={onClose}
        type="button"
      >
        <UiIcon name="close" />
      </button>
      <aside className={open ? "validation-drawer open" : "validation-drawer"} aria-hidden={!open}>
        <div className="drawer-title">
          <div>
            <span>کنترل کیفیت مدل</span>
            <strong>{formatNumber(outputs.validations.length)} مورد نیازمند بررسی</strong>
          </div>
          <button
            aria-label="بستن داخلی پنل بررسی مدل"
            className="icon-button"
            data-close-validation
            onClick={onClose}
            onMouseDown={onClose}
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <div className="issue-filters" role="group" aria-label="فیلتر مسائل">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">همه</button>
          <button className={filter === "error" ? "active" : ""} onClick={() => setFilter("error")} type="button">خطا {formatNumber(counts.error)}</button>
          <button className={filter === "warning" ? "active" : ""} onClick={() => setFilter("warning")} type="button">هشدار {formatNumber(counts.warning)}</button>
          <button className={filter === "info" ? "active" : ""} onClick={() => setFilter("info")} type="button">اطلاع {formatNumber(counts.info)}</button>
        </div>

        <div className="drawer-list">
          {issues.length ? issues.map((issue) => (
            <article key={issue.id} className={`issue-card ${issue.severity}`}>
              <div className="issue-card-head">
                <span className="severity-dot" />
                <strong>{issue.message}</strong>
              </div>
              <p>{issueRecommendation(issue)}</p>
              <footer>
                <span>{moduleTitle(issue.module)}</span>
                {issue.sourceSheet ? <code>منبع مفروضه</code> : null}
              </footer>
            </article>
          )) : (
            <div className="empty-state"><UiIcon name="check" /><strong>موردی در این دسته وجود ندارد.</strong></div>
          )}
        </div>
      </aside>
    </>
  );
}

function FormulaTraceDrawer() {
  const { selectedTrace, selectTrace } = useProject();
  if (!selectedTrace) return null;
  return (
    <aside className="trace-drawer">
      <div className="drawer-title">
        <div><span>ردیابی فرمول</span><strong>{selectedTrace.label}</strong></div>
        <button aria-label="بستن ردیابی فرمول" className="icon-button" onClick={() => selectTrace(null)} type="button"><UiIcon name="close" /></button>
      </div>
      <code className="formula-code">{selectedTrace.formula}</code>
      <div className="trace-inputs">
        {selectedTrace.inputs.map((input) => (
          <div key={`${input.label}-${input.source}`}>
            <span>{input.label}</span>
            <strong>{String(input.value ?? "ناموجود")}</strong>
            {input.source ? <small>{input.source}</small> : null}
          </div>
        ))}
      </div>
      <div className="trace-result">
        <span>نتیجه محاسبه</span>
        <strong>{String(selectedTrace.result ?? "ناموجود")}</strong>
      </div>
    </aside>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  return (
    <div className="project-shell">
      <TopCommandBar issuesOpen={issuesOpen} onToggleIssues={() => setIssuesOpen((current) => !current)} />
      <div className="workspace-grid">
        <ProjectSummaryRail />
        <ProjectNavigation />
        <main className="workspace-main">{children}</main>
      </div>
      <ValidationDrawer open={issuesOpen} onClose={() => setIssuesOpen(false)} />
      <FormulaTraceDrawer />
    </div>
  );
}

export function ProjectShell({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <ShellInner>{children}</ShellInner>
    </ProjectProvider>
  );
}
