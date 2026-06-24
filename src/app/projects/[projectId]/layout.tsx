import { ProjectShell } from "@/components/project/ProjectShell";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectShell>{children}</ProjectShell>;
}
