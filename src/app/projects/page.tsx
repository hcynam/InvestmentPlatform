"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadProjects } from "@/lib/project-storage";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    try {
      setProjects(loadProjects(window.localStorage));
    } catch {
      setProjects([]);
    }
  }, []);

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <span>Investment Platform</span>
        <h1>پروژه‌های امکان‌سنجی</h1>
        {projects === null ? (
          <p aria-live="polite">در حال بارگذاری فهرست پروژه‌ها…</p>
        ) : projects.length === 0 ? (
          <div className="project-empty-state">
            <p>هنوز پروژه‌ای ایجاد نشده است. نخستین پروژه واقعی خود را بسازید و اطلاعات را از ابتدا وارد کنید.</p>
            <Link className="primary-button" href="/projects/new">ایجاد پروژه جدید</Link>
          </div>
        ) : (
          <>
            <div className="project-list">
              {projects.map((project) => (
                <Link className="project-list-item" href={`/projects/${project.id}/overview`} key={project.id}>
                  <strong>{project.name}</strong>
                  <span>{project.code}</span>
                </Link>
              ))}
            </div>
            <Link className="primary-button" href="/projects/new">ایجاد پروژه جدید</Link>
          </>
        )}
      </section>
    </main>
  );
}
