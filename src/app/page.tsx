import Link from "next/link";
import Image from "next/image";
import { Wrench, DollarSign, TrendingDown } from "lucide-react";

const apps = [
  {
    id: "estimate-dispute",
    title: "Estimate Dispute",
    icon: Wrench,
    href: "/estimate-dispute",
    status: "active" as const,
  },
  {
    id: "acv",
    title: "ACV",
    icon: DollarSign,
    href: "/acv",
    status: "active" as const,
  },
  {
    id: "dv",
    title: "DV",
    icon: TrendingDown,
    href: "/dv",
    status: "coming-soon" as const,
  },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-5">
          <Image src="/logo.jpg" alt="Modern Appraisers" width={160} height={48} className="h-10 w-auto" priority />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-1 text-gray-900">Apps</h2>
          <p className="text-gray-400 text-sm">Select a tool to get started.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = app.status === "active";
            return (
              <Link
                key={app.id}
                href={isActive ? app.href : "#"}
                className={isActive ? "group" : "cursor-not-allowed"}
              >
                <div className={`relative rounded-2xl border bg-white shadow-sm h-48 flex flex-col items-center justify-center gap-4 transition-all duration-200 ${
                  isActive
                    ? "border-gray-200 group-hover:border-blue-400 group-hover:shadow-lg group-hover:-translate-y-0.5"
                    : "border-gray-100 opacity-50"
                }`}>
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    isActive ? "bg-blue-50" : "bg-gray-100"
                  }`}>
                    <Icon className={`w-7 h-7 ${isActive ? "text-blue-600" : "text-gray-400"}`} strokeWidth={1.75} />
                  </div>
                  <span className="text-2xl font-bold tracking-tight text-gray-900">{app.title}</span>
                  {app.status === "coming-soon" && (
                    <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-widest text-gray-400">
                      Soon
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
