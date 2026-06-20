import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import { I18nProvider } from "@/lib/i18n/context";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universal DNS Hub - 多云域名管理系统",
  description: "支持 Cloudflare、阿里云、腾讯云等多云 DNS 服务商的统一管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <I18nProvider>
          <ToastProvider>
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
