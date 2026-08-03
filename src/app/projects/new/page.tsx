"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBlankProject } from "@/lib/project-factory";
import { saveProject } from "@/lib/project-storage";
import type { BaseCurrency, CalculationBasis, DisplayUnit, ProjectType } from "@/lib/types";

const projectTypes: ProjectType[] = [
  "نرم‌افزاری / پلتفرمی",
  "صنعتی / تولیدی",
  "خدماتی",
  "زیرساختی",
  "کشاورزی",
  "بازرگانی",
  "معدنی",
  "انرژی",
  "ساختمانی",
  "ترکیبی",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [baseYear, setBaseYear] = useState("");
  const [constructionStartDate, setConstructionStartDate] = useState("");
  const [constructionDurationMonths, setConstructionDurationMonths] = useState("");
  const [analysisHorizonYears, setAnalysisHorizonYears] = useState("");
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrency>("ریال");
  const [calculationBasis, setCalculationBasis] = useState<CalculationBasis>("واقعی");
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>("billion-rial");
  const [error, setError] = useState("");

  const createProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectType) return;
    try {
      const project = createBlankProject({
        name,
        code,
        projectType,
        baseYear: Number(baseYear),
        constructionStartDate,
        constructionDurationMonths: Number(constructionDurationMonths),
        analysisHorizonYears: Number(analysisHorizonYears),
        baseCurrency,
        calculationBasis,
        displayUnit,
      });
      saveProject(window.localStorage, project);
      router.push(`/projects/${project.id}/setup`);
    } catch {
      setError("ذخیره پروژه در مرورگر ممکن نشد. دسترسی Storage مرورگر را بررسی کنید.");
    }
  };

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <span>New Project</span>
        <h1>ایجاد پروژه جدید</h1>
        <p>فقط اطلاعات ساختاری اولیه را وارد کنید. هیچ مبلغ، درآمد، هزینه، تسهیلات، سناریوی تحلیلی یا KPI نمونه ساخته نمی‌شود.</p>
        <form onSubmit={createProject}>
          <div className="field-grid">
            <label className="editable-field span-2">
              <span>نام پروژه</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="نام واقعی پروژه" />
            </label>
            <label className="editable-field">
              <span>کد پروژه</span>
              <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="کد داخلی پروژه" dir="ltr" />
            </label>
            <label className="editable-field">
              <span>نوع پروژه</span>
              <select required value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                <option value="">انتخاب کنید</option>
                {projectTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="editable-field">
              <span>سال پایه</span>
              <input required min="1300" max="2500" type="number" value={baseYear} onChange={(event) => setBaseYear(event.target.value)} />
            </label>
            <label className="editable-field">
              <span>تاریخ شروع ساخت</span>
              <input required type="date" value={constructionStartDate} onChange={(event) => setConstructionStartDate(event.target.value)} />
            </label>
            <label className="editable-field">
              <span>مدت ساخت (ماه)</span>
              <input required min="0" type="number" value={constructionDurationMonths} onChange={(event) => setConstructionDurationMonths(event.target.value)} />
            </label>
            <label className="editable-field">
              <span>افق تحلیل (سال)</span>
              <input required min="1" max="100" type="number" value={analysisHorizonYears} onChange={(event) => setAnalysisHorizonYears(event.target.value)} />
            </label>
            <label className="editable-field">
              <span>ارز پایه</span>
              <select value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value as BaseCurrency)}>
                <option value="ریال">ریال</option>
                <option value="تومان">تومان</option>
              </select>
            </label>
            <label className="editable-field">
              <span>مبنای محاسبه</span>
              <select value={calculationBasis} onChange={(event) => setCalculationBasis(event.target.value as CalculationBasis)}>
                <option value="واقعی">واقعی</option>
                <option value="اسمی">اسمی</option>
                <option value="اسمی و واقعی">اسمی و واقعی</option>
              </select>
            </label>
            <label className="editable-field">
              <span>واحد نمایش</span>
              <select value={displayUnit} onChange={(event) => setDisplayUnit(event.target.value as DisplayUnit)}>
                <option value="rial">ریال</option>
                <option value="million-rial">میلیون ریال</option>
                <option value="billion-rial">میلیارد ریال</option>
              </select>
            </label>
          </div>
          {error ? <p className="text-danger" role="alert">{error}</p> : null}
          <div className="landing-actions">
            <button className="primary-button" type="submit">ساخت پروژه</button>
            <Link className="ghost-button" href="/projects">انصراف</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
