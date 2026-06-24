import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Investment Feasibility Platform",
  description: "پلتفرم امکان‌سنجی، مدل‌سازی مالی، ارزش‌گذاری و بانک‌پذیری پروژه‌های سرمایه‌گذاری ایران",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
