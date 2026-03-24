import Link from "next/link";
import Image from "next/image";
import { MigrateData } from "@/components/migrate-data";
import { LogoutButton } from "@/components/logout-button";

const apps = [
  {
    id: "estimate-dispute",
    title: "Estimate Dispute",
    description: "Review & dispute repair estimates",
    href: "/estimate-dispute",
    status: "active" as const,
    accentColor: "border-l-blue-500 hover:border-l-blue-600",
  },
  {
    id: "acv",
    title: "ACV",
    description: "Actual cash value reports",
    href: "/acv",
    status: "active" as const,
    accentColor: "border-l-emerald-500 hover:border-l-emerald-600",
  },
  {
    id: "rules-laws",
    title: "Rules / Laws",
    description: "State laws & appraisal clauses",
    href: "/rules-laws",
    status: "active" as const,
    accentColor: "border-l-amber-500 hover:border-l-amber-600",
  },
  {
    id: "negotiations",
    title: "Negotiations",
    description: "Email analysis & negotiation strategy",
    href: "/negotiations",
    status: "active" as const,
    accentColor: "border-l-orange-500 hover:border-l-orange-600",
  },
  {
    id: "dv",
    title: "DV",
    description: "Diminished value claims",
    href: "/dv",
    status: "coming-soon" as const,
    accentColor: "border-l-gray-300 hover:border-l-gray-400",
  },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <MigrateData />
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" priority /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-1 text-gray-900">Apps</h2>
          <p className="text-gray-400 text-sm">Select a tool to get started.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => {
            const isActive = app.status === "active";
            return (
              <Link
                key={app.id}
                href={isActive ? app.href : "#"}
                className={isActive ? "group" : "cursor-not-allowed"}
              >
                <div className={`relative rounded-lg border border-gray-200 border-l-4 bg-white px-6 py-8 transition-all duration-200 ${app.accentColor} ${
                  isActive
                    ? "group-hover:shadow-md group-hover:-translate-y-0.5"
                    : "opacity-45"
                }`}>
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">{app.title}</h3>
                  <p className="text-sm text-gray-500">{app.description}</p>
                  {app.status === "coming-soon" && (
                    <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wider text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      Coming soon
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
