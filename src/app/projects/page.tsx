import Link from "next/link";
import { seedProject } from "@/lib/seed";

export default function ProjectsPage() {
  return (
    <main className="landing-shell">
      <section className="landing-card">
        <span>Investment Platform</span>
        <h1>پلتفرم امکان‌سنجی و مدل‌سازی مالی پروژه‌های سرمایه‌گذاری</h1>
        <p>نسخه پایه محصول از روی فایل Excel نهایی و پرامپت محصول ساخته شده است.</p>
        <Link className="primary-button" href={`/projects/${seedProject.id}/overview`}>ورود به workspace پروژه</Link>
      </section>
    </main>
  );
}
