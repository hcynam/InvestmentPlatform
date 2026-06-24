import Link from "next/link";

export default function NewProjectPage() {
  return (
    <main className="landing-shell">
      <section className="landing-card">
        <span>New Project</span>
        <h1>ایجاد پروژه جدید</h1>
        <p>در این فاز seed پروژه از workbook بارگذاری شده است. فرم ایجاد پروژه برای backend/PostgreSQL آماده می‌شود.</p>
        <Link className="primary-button" href="/projects/solar-kerman/setup">بازگشت به پروژه نمونه</Link>
      </section>
    </main>
  );
}
