import type { Metadata } from "next";
import { DashboardStats } from "@/components/dashboard/stats";
import { AIMagicBox } from "@/components/ai-magic-box";
import { ResponsiveContainer, ResponsiveGrid } from "@/components/ui/responsive-container";
import HomeContent from "./home-content";

export const metadata: Metadata = {
  title: "Universal DNS Hub - 多云域名管理系统",
  description: "统一管理 Cloudflare、阿里云、腾讯云等 DNS 服务商",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <ResponsiveContainer>
        {/* 头部 */}
        <div className="py-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Universal DNS Hub
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            多云域名管理系统 - 统一管理 Cloudflare、阿里云、腾讯云等 DNS 服务商
          </p>
        </div>

        {/* 统计数据 */}
        <section className="mb-8">
          <DashboardStats />
        </section>

        {/* AI Magic Box */}
        <section className="mb-8">
          <AIMagicBox />
        </section>

        {/* 快速链接 */}
        <HomeContent />
      </ResponsiveContainer>
    </div>
  );
}
