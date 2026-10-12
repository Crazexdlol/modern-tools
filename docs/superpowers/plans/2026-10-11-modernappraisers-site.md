# modernappraisers.com Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new modernappraisers.com public site + customer portal + minimal staff reply surface as a standalone Next.js 16 app at `/modernappraisers/`, writing into the shared HamsPortal Supabase project. Local only — no deploy.

**Architecture:** Separate Next.js app in a sibling folder (zero shared code with HamsPortal). Tailwind v4, no shadcn, hand-rolled component primitives, Inter typography. Supabase for auth + DB + storage. Customer-specific data lives in new tables (`customer_users`, `customer_claim_access`, `customer_messages`, `customer_claim_documents`); the HamsPortal `acv_history` table gets inserts only, no column changes. Customer-submitted claims land in HAMS as unassigned open rows; the submission description auto-posts as the claim's first HAMS `messages` row.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind v4, @supabase/ssr, @supabase/supabase-js, @fontsource-variable/inter, Vitest (new — HamsPortal has no test framework), Resend (email), Supabase phone auth (SMS OTP).

---

## Phase 0 — Scaffold

### Task 0.1: Create the new Next.js app

**Files:**
- Create: `modernappraisers/package.json`
- Create: `modernappraisers/tsconfig.json`
- Create: `modernappraisers/next.config.ts`
- Create: `modernappraisers/.gitignore`
- Create: `modernappraisers/src/app/layout.tsx`
- Create: `modernappraisers/src/app/page.tsx` (placeholder)
- Create: `modernappraisers/src/app/globals.css`
- Create: `modernappraisers/.env.local.example`

- [ ] **Step 1:** Create `modernappraisers/package.json`:

```json
{
  "name": "modernappraisers-site",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3100",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^16.1.6",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.0",
    "@fontsource-variable/inter": "^5.1.0",
    "resend": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5",
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "^16.1.6",
    "vitest": "^2.1.0",
    "@vitest/ui": "^2.1.0"
  }
}
```

- [ ] **Step 2:** Create `modernappraisers/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3:** Create `modernappraisers/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Supabase storage URLs for customer-uploaded preview thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ektglhdstobaipdqssjx.supabase.co' },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 4:** Create `modernappraisers/.gitignore`:

```
node_modules
.next
.env.local
.vercel
*.tsbuildinfo
next-env.d.ts
.DS_Store
```

- [ ] **Step 5:** Create `modernappraisers/.env.local.example` (template for the real `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://ektglhdstobaipdqssjx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=paste-service-key-here-SERVER-ONLY

NEXT_PUBLIC_SITE_URL=http://localhost:3100
HAMSPORTAL_URL=https://hamsportal.com

RESEND_API_KEY=
```

- [ ] **Step 6:** Create `modernappraisers/src/app/globals.css`:

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";

@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;

  --color-bg: #ffffff;
  --color-bg-subtle: #fafafa;
  --color-ink: #0a0a0a;
  --color-ink-muted: #4b5563;
  --color-ink-soft: #6b7280;
  --color-border: #e5e7eb;
  --color-border-strong: #d1d5db;
  --color-accent: #0ea5e9;
  --color-accent-ink: #0369a1;
  --color-success: #059669;
  --color-danger: #dc2626;

  --radius-card: 10px;
}

html, body { background: var(--color-bg); color: var(--color-ink); font-family: var(--font-sans); font-feature-settings: "cv11", "ss01"; }
body { -webkit-font-smoothing: antialiased; }

::selection { background: var(--color-accent); color: #fff; }
```

- [ ] **Step 7:** Create `modernappraisers/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Modern Appraisers — Independent vehicle appraisals',
  description:
    'Independent vehicle appraisals since 1999. We recover fair value for vehicle owners against low-ball insurance offers. Typical recovery $3K–$6K per claim.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8:** Create `modernappraisers/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-[color:var(--color-ink-soft)]">Scaffold ready — Phase 1 next.</p>
    </main>
  )
}
```

- [ ] **Step 9:** Install deps and verify the dev server runs:

```bash
cd modernappraisers && npm install && npm run dev
```

Expected: `Local: http://localhost:3100` and loading the URL shows "Scaffold ready".

- [ ] **Step 10:** Commit.

```bash
git add modernappraisers/
git commit -m "scaffold: new modernappraisers.com Next.js app at /modernappraisers"
```

### Task 0.2: Wire Supabase clients

**Files:**
- Create: `modernappraisers/src/lib/supabase/client.ts`
- Create: `modernappraisers/src/lib/supabase/server.ts`
- Create: `modernappraisers/src/lib/supabase/service.ts`
- Create: `modernappraisers/src/lib/supabase/middleware.ts`
- Create: `modernappraisers/middleware.ts`
- Create: `modernappraisers/.env.local` (populate with real keys — service role from HAMS memory)

- [ ] **Step 1:** Populate `.env.local` with the real values. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` come from the HAMS `.env.local` (same Supabase project). `SUPABASE_SERVICE_ROLE_KEY` is the service key from the memory reference. Leave `RESEND_API_KEY` blank for now.

- [ ] **Step 2:** Create `modernappraisers/src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    },
  )
}
```

- [ ] **Step 4:** Create `modernappraisers/src/lib/supabase/service.ts`:

```ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only. Bypasses RLS. Never import from client components.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
```

- [ ] **Step 5:** Create `modernappraisers/src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  await supabase.auth.getUser()
  return response
}
```

- [ ] **Step 6:** Create `modernappraisers/middleware.ts` at the app root:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 7:** Verify: `cd modernappraisers && npm run build`. Expected: build succeeds with no Supabase-related errors.

- [ ] **Step 8:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(modernappraisers): wire Supabase browser + server + service + middleware"
```

### Task 0.3: Set up Vitest + first smoke test

**Files:**
- Create: `modernappraisers/vitest.config.ts`
- Create: `modernappraisers/src/lib/__tests__/smoke.test.ts`

- [ ] **Step 1:** Create `modernappraisers/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.{test,spec}.{ts,tsx}'] },
})
```

- [ ] **Step 2:** Create `modernappraisers/src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3:** Run: `cd modernappraisers && npm test`. Expected: 1 test passes.

- [ ] **Step 4:** Commit.

```bash
git add modernappraisers/
git commit -m "chore(modernappraisers): vitest wired, smoke test green"
```

---

## Phase 1 — Design primitives + layouts

### Task 1.1: Component primitives

**Files:**
- Create: `modernappraisers/src/components/ui/button.tsx`
- Create: `modernappraisers/src/components/ui/input.tsx`
- Create: `modernappraisers/src/components/ui/textarea.tsx`
- Create: `modernappraisers/src/components/ui/select.tsx`
- Create: `modernappraisers/src/components/ui/card.tsx`
- Create: `modernappraisers/src/components/ui/badge.tsx`
- Create: `modernappraisers/src/components/ui/field.tsx`
- Create: `modernappraisers/src/lib/cn.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/cn.ts`:

```ts
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
```

- [ ] **Step 2:** Create `modernappraisers/src/components/ui/button.tsx`:

```tsx
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = 'inline-flex items-center justify-center h-10 px-5 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2'
  const variants: Record<Variant, string> = {
    primary:   'bg-[color:var(--color-ink)] text-white hover:bg-black',
    secondary: 'bg-white text-[color:var(--color-ink)] border border-[color:var(--color-border-strong)] hover:border-[color:var(--color-ink)]',
    ghost:     'bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-bg-subtle)]',
  }
  return <button type={type} className={cn(base, variants[variant], className)} {...rest} />
}
```

- [ ] **Step 3:** Create `modernappraisers/src/components/ui/input.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full h-10 px-3 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-soft)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    />
  )
}
```

- [ ] **Step 4:** Create `modernappraisers/src/components/ui/textarea.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full min-h-[96px] px-3 py-2 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-soft)] resize-y',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    />
  )
}
```

- [ ] **Step 5:** Create `modernappraisers/src/components/ui/select.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full h-10 px-3 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}
```

- [ ] **Step 6:** Create `modernappraisers/src/components/ui/card.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('bg-white border border-[color:var(--color-border)] rounded-[10px] shadow-[0_1px_2px_rgb(0_0_0_/_0.05)]', className)} {...rest} />
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...rest} />
}
```

- [ ] **Step 7:** Create `modernappraisers/src/components/ui/badge.tsx`:

```tsx
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'danger'

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-[color:var(--color-bg-subtle)] text-[color:var(--color-ink-muted)] border-[color:var(--color-border)]',
    accent:  'bg-sky-50 text-[color:var(--color-accent-ink)] border-sky-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    danger:  'bg-red-50 text-red-800 border-red-200',
  }
  return <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full border text-xs font-semibold', tones[tone], className)}>{children}</span>
}
```

- [ ] **Step 8:** Create `modernappraisers/src/components/ui/field.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Field({ label, hint, error, children, required, className }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-sm font-semibold text-[color:var(--color-ink)] mb-1.5">
        {label}{required && <span className="text-[color:var(--color-danger)] ml-0.5">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block mt-1 text-xs text-[color:var(--color-ink-soft)]">{hint}</span>}
      {error && <span className="block mt-1 text-xs text-[color:var(--color-danger)]">{error}</span>}
    </label>
  )
}
```

- [ ] **Step 9:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(ui): primitives — Button Input Textarea Select Card Badge Field"
```

### Task 1.2: Site chrome (header + footer + container)

**Files:**
- Create: `modernappraisers/src/components/site-header.tsx`
- Create: `modernappraisers/src/components/site-footer.tsx`
- Create: `modernappraisers/src/components/container.tsx`
- Modify: `modernappraisers/src/app/layout.tsx` — wrap children in header + footer

- [ ] **Step 1:** Create `modernappraisers/src/components/container.tsx`:

```tsx
import { cn } from '@/lib/cn'

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-6', className)}>{children}</div>
}
```

- [ ] **Step 2:** Create `modernappraisers/src/components/site-header.tsx`:

```tsx
import Link from 'next/link'
import { Container } from './container'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-[color:var(--color-border)]">
      <Container className="h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-base tracking-tight text-[color:var(--color-ink)]">
          Modern Appraisers
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[color:var(--color-ink-muted)]">
          <Link href="/services" className="hover:text-[color:var(--color-ink)]">Services</Link>
          <Link href="/about" className="hover:text-[color:var(--color-ink)]">About</Link>
          <Link href="/contact" className="hover:text-[color:var(--color-ink)]">Contact</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">
            Sign in
          </Link>
          <Link href="/submit" className="inline-flex items-center h-9 px-4 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">
            Submit a Claim
          </Link>
        </div>
      </Container>
    </header>
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/components/site-footer.tsx`:

```tsx
import Link from 'next/link'
import { Container } from './container'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[color:var(--color-border)] py-10">
      <Container className="flex flex-wrap items-center justify-between gap-6 text-sm text-[color:var(--color-ink-soft)]">
        <div>© {new Date().getFullYear()} Modern Appraisers. Independent vehicle appraisals since 1999.</div>
        <nav className="flex items-center gap-6">
          <Link href="/services" className="hover:text-[color:var(--color-ink)]">Services</Link>
          <Link href="/about" className="hover:text-[color:var(--color-ink)]">About</Link>
          <Link href="/contact" className="hover:text-[color:var(--color-ink)]">Contact</Link>
          <Link href="/login" className="hover:text-[color:var(--color-ink)]">Sign in</Link>
        </nav>
      </Container>
    </footer>
  )
}
```

- [ ] **Step 4:** Modify `modernappraisers/src/app/layout.tsx` — wrap children:

```tsx
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'Modern Appraisers — Independent vehicle appraisals',
  description:
    'Independent vehicle appraisals since 1999. We recover fair value for vehicle owners against low-ball insurance offers. Typical recovery $3K–$6K per claim.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  )
}
```

- [ ] **Step 5:** Visually verify — `npm run dev`, open `http://localhost:3100`, see the header + footer around the placeholder content. Commit.

```bash
git add modernappraisers/
git commit -m "feat(ui): site header + footer + container"
```

---

## Phase 2 — Marketing pages

### Task 2.1: Home page

**Files:**
- Modify: `modernappraisers/src/app/page.tsx` — replace placeholder with real home page

- [ ] **Step 1:** Rewrite `modernappraisers/src/app/page.tsx`:

```tsx
import Link from 'next/link'
import { Container } from '@/components/container'

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-20 pb-24 border-b border-[color:var(--color-border)]">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Independent appraisal · Est. 1999</p>
              <h1 className="text-[clamp(40px,6vw,72px)] leading-[1.02] tracking-[-0.03em] font-bold text-[color:var(--color-ink)]">
                Settle for<br/>
                <span className="text-[color:var(--color-accent)]">what you're owed.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
                Independent vehicle appraisals that recover the real value of your claim — not what the insurance company says it's worth. Typical recovery $3K–$6K per case.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim →</Link>
                <Link href="/services" className="inline-flex items-center h-11 px-5 rounded-md border border-[color:var(--color-border-strong)] text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]">How it works</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 border-t border-[color:var(--color-border)] pt-6">
              <Stat label="Recovered for clients" value="$980K+" />
              <Stat label="Typical per-claim result" value="$3K–6K" />
              <Stat label="Years of experience" value="26" />
              <Stat label="States covered" value="50" />
            </div>
          </div>
        </Container>
      </section>

      {/* Services */}
      <section className="py-20">
        <Container>
          <div className="flex items-baseline justify-between mb-10">
            <h2 className="text-3xl font-bold tracking-tight">What we do</h2>
            <Link href="/services" className="text-sm font-semibold text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">All services →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceCard title="Actual Cash Value (ACV)" copy="Independent valuation when your car is a total loss and the insurer's offer undershoots the market." href="/services/acv" />
            <ServiceCard title="Diminished Value (DV)"   copy="Recover the lost resale value of your vehicle after a collision was repaired." href="/services/diminished-value" />
            <ServiceCard title="Estimate Dispute"        copy="When the repair estimate doesn't match the real cost — we document the gap." href="/services/estimate-dispute" />
            <ServiceCard title="Appraisal Clause"        copy="Third-party dispute resolution under your policy's standard appraisal clause." href="/services/appraisal-clause" />
          </div>
        </Container>
      </section>

      {/* CTA band */}
      <section className="py-20 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-subtle)]">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">Low-ball offer? Let's take a look.</h2>
            <p className="mt-4 text-lg text-[color:var(--color-ink-muted)]">Submit your claim online in under three minutes. We'll follow up within one business day.</p>
            <div className="mt-6"><Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim</Link></div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)]">{label}</div>
    </div>
  )
}

function ServiceCard({ title, copy, href }: { title: string; copy: string; href: string }) {
  return (
    <Link href={href} className="group block p-6 bg-white border border-[color:var(--color-border)] rounded-[10px] hover:border-[color:var(--color-ink)] transition-colors">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{copy}</p>
      <span className="mt-4 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Learn more →</span>
    </Link>
  )
}
```

- [ ] **Step 2:** Visually verify — the home page renders with hero + stats grid + services + CTA band. Commit.

```bash
git add modernappraisers/
git commit -m "feat(home): landing page — hero, stats, services, CTA"
```

### Task 2.2: About page

**Files:**
- Create: `modernappraisers/src/app/about/page.tsx`

- [ ] **Step 1:** Create the About page content. The page follows the same layout pattern as home: hero + a few sections. Keep copy specific and non-generic.

```tsx
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About — Modern Appraisers', description: 'Independent appraisers who work for vehicle owners, not insurance companies. 26 years in the field.' }

export default function AboutPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">About</p>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl">Independent appraisers who work for you.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">
          Modern Appraisers has been resolving vehicle valuation disputes since 1999 — advocating for the actual market value of your vehicle, not the number the insurance company's internal appraiser landed on.
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 border-t border-[color:var(--color-border)] pt-16">
          <section>
            <h2 className="text-base font-semibold mb-3">What "independent" means</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">We're paid by the vehicle owner — not the insurer. Our only interest is in documenting the real value of your car.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">How we work</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">Comparable-sales research, documented repair cost analysis, and when necessary a third-party appraisal under your policy's appraisal clause.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-3">Who we help</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">Vehicle owners facing low total-loss offers, undervalued post-repair claims, or denied diminished-value requests. All vehicle types — from daily drivers to exotics.</p>
          </section>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 2:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(about): about page"
```

### Task 2.3: Services index + detail pages

**Files:**
- Create: `modernappraisers/src/app/services/page.tsx` (index)
- Create: `modernappraisers/src/app/services/[slug]/page.tsx` (detail)
- Create: `modernappraisers/src/lib/services-content.ts` (shared content)

- [ ] **Step 1:** Create `modernappraisers/src/lib/services-content.ts`:

```ts
export interface ServiceContent {
  slug: string
  title: string
  shortTitle: string
  summary: string
  whenYouNeedIt: string[]
  howItWorks: string[]
  typicalRecovery?: string
}

export const SERVICES: ServiceContent[] = [
  {
    slug: 'acv',
    title: 'Actual Cash Value (ACV)',
    shortTitle: 'ACV',
    summary: 'When your car is a total loss and the insurer\'s payout undershoots real market value, we document what the vehicle was actually worth the day before the loss.',
    whenYouNeedIt: [
      'Your car was declared a total loss and you believe the offer is too low',
      'The insurer\'s valuation report uses stale or non-comparable listings',
      'Your vehicle had features / low mileage / recent work that\'s been ignored',
    ],
    howItWorks: [
      'We pull current market comparables matched to your exact spec',
      'Mileage and condition adjustments documented against actual listings',
      'Final report delivered with a defensible market value and the paper trail',
    ],
    typicalRecovery: '$3,000–$6,000 above initial offer',
  },
  {
    slug: 'diminished-value',
    title: 'Diminished Value (DV)',
    shortTitle: 'DV',
    summary: 'After a collision repair, a vehicle with a history is worth less — even when the repair is perfect. We measure that loss and build the claim.',
    whenYouNeedIt: [
      'Your vehicle was in an at-fault-other-party accident and has been repaired',
      'You\'re noticing lower trade-in or private-sale offers because of the accident history',
      'The insurer denied or lowballed a diminished-value claim',
    ],
    howItWorks: [
      'Pre-loss and post-repair valuation on comparable market data',
      'Severity, repair-quality, and resale-impact adjustments documented',
      'Formal DV report ready for insurer negotiation or appraisal clause',
    ],
    typicalRecovery: '$2,000–$5,000 depending on severity',
  },
  {
    slug: 'estimate-dispute',
    title: 'Estimate Dispute',
    shortTitle: 'Estimate Dispute',
    summary: 'When the insurer\'s repair estimate underpays the body shop and leaves you holding the difference, we review the estimate line by line.',
    whenYouNeedIt: [
      'The insurer\'s estimate doesn\'t cover the shop\'s actual labor rates',
      'OEM parts are being swapped for aftermarket without consent',
      'Supplements are being denied',
    ],
    howItWorks: [
      'Line-by-line review of the insurer\'s estimate vs. the shop\'s',
      'OEM / labor-rate / supplement documentation',
      'Written dispute ready for negotiation',
    ],
  },
  {
    slug: 'post-repair-inspection',
    title: 'Post-Repair Inspection',
    shortTitle: 'Post-Repair',
    summary: 'An independent inspection to confirm the shop actually did the work — and did it right.',
    whenYouNeedIt: [
      'You suspect the repair wasn\'t fully performed',
      'You\'re documenting repair quality for a DV claim',
      'You want paper on the record before selling or trading',
    ],
    howItWorks: [
      'In-person inspection with structural, paint, and parts check',
      'Comparison against the insurer-approved estimate',
      'Written report with photos',
    ],
  },
  {
    slug: 'appraisal-clause',
    title: 'Appraisal Clause',
    shortTitle: 'Appraisal Clause',
    summary: 'When you and the insurer can\'t agree on value, your policy\'s appraisal clause is the formal dispute path. We serve as your appraiser.',
    whenYouNeedIt: [
      'Negotiation has stalled on either ACV or DV',
      'You\'ve been told to go to appraisal by the insurer',
      'You want a third party to force the issue',
    ],
    howItWorks: [
      'We serve as your appointed appraiser',
      'Opposing appraisers nominate a neutral umpire',
      'A written award is binding under your policy',
    ],
  },
]
```

- [ ] **Step 2:** Create `modernappraisers/src/app/services/page.tsx`:

```tsx
import Link from 'next/link'
import { Container } from '@/components/container'
import { SERVICES } from '@/lib/services-content'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Services — Modern Appraisers' }

export default function ServicesPage() {
  return (
    <main className="py-20">
      <Container>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Services</p>
        <h1 className="text-5xl font-bold tracking-tight max-w-3xl mb-6">Five ways we recover value for you.</h1>
        <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl mb-12">Every claim is different. These are the five services we offer — pick the one that matches your situation, or submit a claim and we'll triage.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SERVICES.map(s => (
            <Link key={s.slug} href={`/services/${s.slug}`} className="group block p-6 bg-white border border-[color:var(--color-border)] rounded-[10px] hover:border-[color:var(--color-ink)] transition-colors">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{s.summary}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[color:var(--color-accent-ink)] group-hover:text-[color:var(--color-ink)]">Read more →</span>
            </Link>
          ))}
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/services/[slug]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Container } from '@/components/container'
import { SERVICES } from '@/lib/services-content'
import type { Metadata } from 'next'

export async function generateStaticParams() { return SERVICES.map(s => ({ slug: s.slug })) }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const s = SERVICES.find(x => x.slug === slug)
  if (!s) return { title: 'Service — Modern Appraisers' }
  return { title: `${s.title} — Modern Appraisers`, description: s.summary }
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const s = SERVICES.find(x => x.slug === slug)
  if (!s) notFound()

  return (
    <main className="py-20">
      <Container>
        <Link href="/services" className="text-sm text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">← All services</Link>
        <h1 className="mt-6 text-5xl font-bold tracking-tight max-w-3xl">{s.title}</h1>
        <p className="mt-6 text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl">{s.summary}</p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-[color:var(--color-border)] pt-16">
          <section>
            <h2 className="text-base font-semibold mb-4">When you'd use this</h2>
            <ul className="space-y-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
              {s.whenYouNeedIt.map((item, i) => <li key={i} className="flex gap-3"><span className="text-[color:var(--color-ink-soft)] mt-[2px]">·</span><span>{item}</span></li>)}
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-4">How it works</h2>
            <ol className="space-y-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
              {s.howItWorks.map((item, i) => <li key={i} className="flex gap-3"><span className="text-[color:var(--color-ink-soft)] mt-[2px] tabular-nums">{i + 1}.</span><span>{item}</span></li>)}
            </ol>
          </section>
        </div>

        {s.typicalRecovery && (
          <div className="mt-16 p-6 border border-[color:var(--color-border)] rounded-[10px] bg-[color:var(--color-bg-subtle)] max-w-2xl">
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)]">Typical recovery</div>
            <div className="mt-2 text-2xl font-bold tracking-tight">{s.typicalRecovery}</div>
          </div>
        )}

        <div className="mt-16">
          <Link href="/submit" className="inline-flex items-center h-11 px-6 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold hover:bg-black">Submit a Claim →</Link>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 4:** Visually verify — `/services` lists 5 cards, each clicks through to its detail page. Commit.

```bash
git add modernappraisers/
git commit -m "feat(services): index + 5 detail pages"
```

### Task 2.4: Contact page

**Files:**
- Create: `modernappraisers/src/app/contact/page.tsx`
- Create: `modernappraisers/src/app/api/contact/route.ts`

- [ ] **Step 1:** Create `modernappraisers/src/app/contact/page.tsx` (form posts to `/api/contact`):

```tsx
'use client'
import { useState } from 'react'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'

export default function ContactPage() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/contact', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)), headers: { 'Content-Type': 'application/json' } })
    setBusy(false)
    if (!res.ok) { setError('Something went wrong. Please email us directly.'); return }
    setSent(true)
  }

  return (
    <main className="py-20">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent-ink)] mb-6">Contact</p>
            <h1 className="text-5xl font-bold tracking-tight mb-6">Get in touch.</h1>
            <p className="text-lg leading-relaxed text-[color:var(--color-ink-muted)] max-w-xl">Have questions before submitting a claim? Reach out. Most replies go out within one business day.</p>

            {!sent ? (
              <form onSubmit={handleSubmit} className="mt-10 space-y-5 max-w-lg">
                <Field label="Name" required><Input name="name" required /></Field>
                <Field label="Email" required><Input type="email" name="email" required /></Field>
                <Field label="Phone"><Input type="tel" name="phone" /></Field>
                <Field label="What can we help with?" required><Textarea name="message" required rows={5} /></Field>
                {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
                <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</Button>
              </form>
            ) : (
              <div className="mt-10 p-6 border border-emerald-200 bg-emerald-50 rounded-[10px] max-w-lg">
                <h2 className="font-semibold">Thanks — message sent.</h2>
                <p className="mt-2 text-sm text-[color:var(--color-ink-muted)]">We'll get back to you within one business day.</p>
              </div>
            )}
          </div>

          <aside className="pt-24 lg:pt-32 space-y-6 text-sm text-[color:var(--color-ink-muted)]">
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Phone</div><a className="text-[color:var(--color-ink)] font-semibold" href="tel:+1-XXX-XXX-XXXX">(XXX) XXX-XXXX</a></div>
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Email</div><a className="text-[color:var(--color-ink)] font-semibold" href="mailto:info@modernappraisers.com">info@modernappraisers.com</a></div>
            <div><div className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-1">Hours</div>Mon–Fri · 9am–6pm PT</div>
          </aside>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/api/contact/route.ts` (server endpoint that emails via Resend, no-ops gracefully if `RESEND_API_KEY` isn't set yet):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional(), message: z.string().min(1).max(5000) })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Dev / pre-Resend-signup: log + return 200 so form behaves correctly during build-out.
    console.log('[contact] (no RESEND_API_KEY set) would send:', parsed.data)
    return NextResponse.json({ ok: true, note: 'logged (no email sent)' })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(key)
  const { name, email, phone, message } = parsed.data
  await resend.emails.send({
    from: 'contact@modernappraisers.com',
    to: 'info@modernappraisers.com',
    reply_to: email,
    subject: `Contact form — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone ?? '-'}\n\n${message}`,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(contact): contact page + /api/contact (Resend, graceful no-key fallback)"
```

---

## Phase 3 — Database migration + Supabase types

### Task 3.1: Write and apply the customer-side DB migration

**Files:**
- Create: `supabase/migration-modernappraisers.sql` (lives in the HAMS supabase/ folder since migrations are managed from there — HAMS schema stays untouched; this adds NEW tables + bucket + RLS only)
- Create: `supabase/migration-modernappraisers-rollback.sql`

- [ ] **Step 1:** Write the migration `supabase/migration-modernappraisers.sql`:

```sql
-- modernappraisers.com customer-side schema (zero HAMS table/column modifications)
-- Run manually in the Supabase SQL editor, same pattern as all other migration-*.sql files.

create table if not exists customer_users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text not null,
  email text not null,
  verification_method text check (verification_method in ('sms','email')),
  verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists customer_claim_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id text not null references acv_history(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, claim_id)
);
create index if not exists customer_claim_access_claim_idx on customer_claim_access(claim_id);

create table if not exists customer_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references acv_history(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','admin')),
  sender_user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);
create index if not exists customer_messages_claim_idx on customer_messages(claim_id, created_at);

create table if not exists customer_claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null references acv_history(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id),
  uploaded_by_type text not null check (uploaded_by_type in ('customer','admin')),
  file_path text not null,
  file_name text not null,
  file_size_bytes bigint,
  mime_type text,
  created_at timestamptz default now()
);
create index if not exists customer_claim_documents_claim_idx on customer_claim_documents(claim_id);

insert into storage.buckets (id, name, public) values ('customer-shared', 'customer-shared', false)
  on conflict (id) do nothing;

alter table customer_users enable row level security;
alter table customer_claim_access enable row level security;
alter table customer_messages enable row level security;
alter table customer_claim_documents enable row level security;

create policy "customer sees own user row"       on customer_users for select using (auth.uid() = id);
create policy "customer inserts own user row"    on customer_users for insert with check (auth.uid() = id);
create policy "customer updates own user row"    on customer_users for update using (auth.uid() = id);

create policy "customer sees own access rows"    on customer_claim_access for select using (auth.uid() = user_id);

create policy "customer sees own thread msgs"    on customer_messages for select using (
  exists (select 1 from customer_claim_access a where a.claim_id = customer_messages.claim_id and a.user_id = auth.uid())
);
create policy "customer posts to own thread"     on customer_messages for insert with check (
  sender_type = 'customer' and sender_user_id = auth.uid()
  and exists (select 1 from customer_claim_access a where a.claim_id = customer_messages.claim_id and a.user_id = auth.uid())
);

create policy "customer sees own thread docs"    on customer_claim_documents for select using (
  exists (select 1 from customer_claim_access a where a.claim_id = customer_claim_documents.claim_id and a.user_id = auth.uid())
);
create policy "customer uploads to own thread"   on customer_claim_documents for insert with check (
  uploaded_by_type = 'customer' and uploaded_by_user_id = auth.uid()
  and exists (select 1 from customer_claim_access a where a.claim_id = customer_claim_documents.claim_id and a.user_id = auth.uid())
);

-- Staff policies: HAMS admins/appraisers (role=admin or role=appraiser in profiles) see everything.
create policy "staff reads customer_users"       on customer_users for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);
create policy "staff writes customer_users"      on customer_users for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);
create policy "staff reads customer_claim_access" on customer_claim_access for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);
create policy "staff writes customer_claim_access" on customer_claim_access for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);
create policy "staff reads customer_messages"    on customer_messages for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);
create policy "staff reads customer_claim_documents" on customer_claim_documents for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);

-- Storage bucket RLS (customer-shared) — same join as the documents table
create policy "customer reads own shared files" on storage.objects for select using (
  bucket_id = 'customer-shared'
  and exists (
    select 1 from customer_claim_documents d
    join customer_claim_access a on a.claim_id = d.claim_id
    where d.file_path = storage.objects.name and a.user_id = auth.uid()
  )
);
create policy "customer uploads own shared files" on storage.objects for insert with check (
  bucket_id = 'customer-shared' and auth.role() = 'authenticated'
);
create policy "staff rw on customer-shared" on storage.objects for all using (
  bucket_id = 'customer-shared'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','appraiser'))
);

-- Prevent one auth user from being BOTH a staff profile AND a customer_users row.
create or replace function assert_single_role_identity() returns trigger as $$
begin
  if tg_table_name = 'profiles' and exists (select 1 from customer_users where id = NEW.id) then
    raise exception 'auth user % already has a customer_users row — cannot create a staff profile', NEW.id;
  elsif tg_table_name = 'customer_users' and exists (select 1 from profiles where id = NEW.id) then
    raise exception 'auth user % already has a staff profile — cannot create a customer_users row', NEW.id;
  end if;
  return NEW;
end$$ language plpgsql;

create trigger profiles_single_role before insert on profiles for each row execute function assert_single_role_identity();
create trigger customer_users_single_role before insert on customer_users for each row execute function assert_single_role_identity();
```

- [ ] **Step 2:** Write the rollback `supabase/migration-modernappraisers-rollback.sql`:

```sql
drop trigger if exists profiles_single_role on profiles;
drop trigger if exists customer_users_single_role on customer_users;
drop function if exists assert_single_role_identity();

drop policy if exists "customer reads own shared files" on storage.objects;
drop policy if exists "customer uploads own shared files" on storage.objects;
drop policy if exists "staff rw on customer-shared" on storage.objects;

drop table if exists customer_claim_documents;
drop table if exists customer_messages;
drop table if exists customer_claim_access;
drop table if exists customer_users;

delete from storage.buckets where id = 'customer-shared';
```

- [ ] **Step 3:** Flag to the user (via a chat message, not a commit): "Migration is ready at `supabase/migration-modernappraisers.sql` — please run it in the Supabase SQL editor when ready. We'll pause here until you confirm. No HAMS tables are modified; new tables + 1 bucket + RLS only."

- [ ] **Step 4:** After user confirms run, commit.

```bash
git add supabase/migration-modernappraisers.sql supabase/migration-modernappraisers-rollback.sql
git commit -m "feat(db): modernappraisers customer-side tables + RLS + storage bucket"
```

### Task 3.2: Generate TypeScript types for the new tables

**Files:**
- Create: `modernappraisers/src/lib/db/types.ts`

- [ ] **Step 1:** Create hand-written types (not auto-generated — small schema, less tooling):

```ts
// Types for the new customer-side tables. HAMS types live elsewhere and are
// NOT imported here (strict separation per CLAUDE.md).

export interface CustomerUserRow {
  id: string                 // uuid, = auth.users.id
  first_name: string | null
  last_name: string | null
  phone: string
  email: string
  verification_method: 'sms' | 'email' | null
  verified_at: string | null
  created_at: string
}

export interface CustomerClaimAccessRow {
  user_id: string
  claim_id: string
  created_at: string
}

export interface CustomerMessageRow {
  id: string
  claim_id: string
  sender_type: 'customer' | 'admin'
  sender_user_id: string
  body: string
  created_at: string
  read_at: string | null
}

export interface CustomerClaimDocumentRow {
  id: string
  claim_id: string
  uploaded_by_user_id: string
  uploaded_by_type: 'customer' | 'admin'
  file_path: string
  file_name: string
  file_size_bytes: number | null
  mime_type: string | null
  created_at: string
}

// Minimal shape of HAMS acv_history row needed by the customer portal.
// We only read the fields a customer is allowed to see.
export interface AcvHistoryRow {
  id: string
  ma_number: string | null
  status: 'open' | 'closed' | null
  closed_at: string | null
  assigned_to: string | null
  status_phase: string | null
  status_phase_set_at: string | null
  created_at: string
  // claim jsonb — shape we write at submit-time
  claim: {
    year?: string | number
    make?: string
    model?: string
    vin?: string
    mileage?: string | number
    dateOfLoss?: string
    insuranceCompany?: string
    claimNumber?: string
    claimTypes?: string[]
    lossAddress?: string
    customerDescription?: string
    source?: 'customer' | 'staff'
    submittedByCustomerUserId?: string
    [key: string]: unknown
  }
}
```

- [ ] **Step 2:** Commit.

```bash
git add modernappraisers/
git commit -m "chore(types): customer-side DB row types"
```

---

## Phase 4 — Auth

### Task 4.1: Signup + email verification route

**Files:**
- Create: `modernappraisers/src/app/signup/page.tsx`
- Create: `modernappraisers/src/app/api/auth/signup/route.ts`
- Create: `modernappraisers/src/app/auth/callback/route.ts`

- [ ] **Step 1:** Create `modernappraisers/src/app/api/auth/signup/route.ts` — handles email-verification signup. Service-role creates the auth user + customer_users row + sends magic link.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const Schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(7),
  verifyMethod: z.enum(['sms', 'email']),
})

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid', details: parsed.error.flatten() }, { status: 400 })
  const { firstName, lastName, email, password, phone, verifyMethod } = parsed.data

  const sb = createServiceClient()

  // Create auth user. For email verification path: email_confirm=false (user must click link).
  // For SMS path: email_confirm=true (we verify via phone separately).
  const { data: userData, error: createErr } = await sb.auth.admin.createUser({
    email, password, phone, email_confirm: verifyMethod === 'sms',
    user_metadata: { first_name: firstName, last_name: lastName },
  })
  if (createErr || !userData.user) return NextResponse.json({ error: createErr?.message ?? 'signup failed' }, { status: 400 })

  const userId = userData.user.id
  const { error: cuErr } = await sb.from('customer_users').insert({
    id: userId, first_name: firstName, last_name: lastName, phone, email,
    verification_method: verifyMethod,
    verified_at: null,  // flipped after /auth/callback or OTP verify
  })
  if (cuErr) {
    // Roll back the auth user if customer_users insert fails.
    await sb.auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: cuErr.message }, { status: 400 })
  }

  if (verifyMethod === 'email') {
    // Supabase sends the confirmation email automatically because email_confirm=false.
    return NextResponse.json({ ok: true, userId, next: 'check-email' })
  } else {
    // Send phone OTP.
    const { error: otpErr } = await sb.auth.signInWithOtp({ phone })
    if (otpErr) return NextResponse.json({ error: otpErr.message, userId, next: 'otp-send-failed' }, { status: 400 })
    return NextResponse.json({ ok: true, userId, next: 'enter-otp' })
  }
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/auth/callback/route.ts` for the email-verification return link:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = req.nextUrl.searchParams.get('next') ?? '/portal'
  if (!code) return NextResponse.redirect(new URL('/login?err=missing-code', req.url))

  const sb = await createClient()
  const { data, error } = await sb.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(new URL('/login?err=verify-failed', req.url))

  // Mark the customer_users row as verified.
  const svc = createServiceClient()
  await svc.from('customer_users').update({ verified_at: new Date().toISOString() }).eq('id', data.user.id)
  return NextResponse.redirect(new URL(next, req.url))
}
```

- [ ] **Step 3:** Commit (we'll add the signup page UI in Task 4.2 as part of the submit wizard — signup here is only used server-side; the `/signup` page is a thin redirect).

```bash
git add modernappraisers/
git commit -m "feat(auth): signup API + email callback"
```

### Task 4.2: Login page + session helpers

**Files:**
- Create: `modernappraisers/src/app/login/page.tsx`
- Create: `modernappraisers/src/app/api/auth/login/route.ts`
- Create: `modernappraisers/src/app/api/auth/logout/route.ts`
- Create: `modernappraisers/src/lib/auth/current-customer.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/auth/current-customer.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { CustomerUserRow } from '@/lib/db/types'

// Returns the current customer, or null if the user is not signed in / is a staff user.
export async function getCurrentCustomer(): Promise<CustomerUserRow | null> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  // Service client because the user's own customer_users row is readable by RLS,
  // but we also want to detect staff (profiles row exists) and short-circuit.
  const svc = createServiceClient()
  const { data: profile } = await svc.from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (profile) return null  // this is a staff user, not a customer

  const { data: cu } = await svc.from('customer_users').select('*').eq('id', user.id).maybeSingle()
  return (cu as CustomerUserRow | null) ?? null
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const sb = await createClient()
  const { data, error } = await sb.auth.signInWithPassword(parsed.data)
  if (error || !data.user) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const sb = await createClient()
  await sb.auth.signOut()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4:** Create `modernappraisers/src/app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Login failed'); return }
    router.push('/portal')
    router.refresh()
  }

  return (
    <main className="py-20">
      <Container>
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-8">Sign in</h1>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email" required><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
            <Field label="Password" required><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
            {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <p className="mt-8 text-sm text-[color:var(--color-ink-muted)]">No account? <Link href="/submit" className="font-semibold text-[color:var(--color-accent-ink)] hover:text-[color:var(--color-ink)]">Submit a claim</Link> — your account is created as part of the submission.</p>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 5:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(auth): login page + session helpers + logout"
```

### Task 4.3: Phone OTP verification page

**Files:**
- Create: `modernappraisers/src/app/verify-otp/page.tsx`
- Create: `modernappraisers/src/app/api/auth/verify-otp/route.ts`

- [ ] **Step 1:** Create `modernappraisers/src/app/api/auth/verify-otp/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const Schema = z.object({ phone: z.string().min(7), token: z.string().min(4) })

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const sb = await createClient()
  const { data, error } = await sb.auth.verifyOtp({ phone: parsed.data.phone, token: parsed.data.token, type: 'sms' })
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'OTP failed' }, { status: 400 })

  // Mark verified.
  const svc = createServiceClient()
  await svc.from('customer_users').update({ verified_at: new Date().toISOString() }).eq('id', data.user.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/verify-otp/page.tsx` (lightweight — form reads `?phone=` from query, posts to API):

```tsx
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export default function VerifyOtpPage() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params?.get('phone') ?? ''
  const next = params?.get('next') ?? '/portal'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, token: code }) })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Verification failed'); return }
    router.push(next); router.refresh()
  }

  return (
    <main className="py-20">
      <Container>
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-4">Verify your phone</h1>
          <p className="text-sm text-[color:var(--color-ink-muted)] mb-8">We sent a code to <span className="font-semibold text-[color:var(--color-ink)]">{phone}</span>. Enter it below.</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Verification code" required><Input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" required /></Field>
            {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Verifying…' : 'Verify'}</Button>
          </form>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 3:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(auth): phone OTP verification page + API"
```

### Task 4.4: Protect /portal with middleware check

**Files:**
- Modify: `modernappraisers/src/lib/supabase/middleware.ts` — add route protection

- [ ] **Step 1:** Replace `modernappraisers/src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const needsAuth = path.startsWith('/portal') || path.startsWith('/staff')
  if (needsAuth && !user) {
    return NextResponse.redirect(new URL(path.startsWith('/staff') ? '/staff/login' : '/login', request.url))
  }
  return response
}
```

- [ ] **Step 2:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(auth): middleware redirects unauth users off /portal and /staff"
```

---

## Phase 5 — Submit flow

### Task 5.1: VIN decode helper

**Files:**
- Create: `modernappraisers/src/lib/vin-decode.ts`
- Create: `modernappraisers/src/lib/__tests__/vin-decode.test.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/vin-decode.ts` (uses the NHTSA VPIC endpoint — no key needed, free):

```ts
export interface DecodedVin {
  year: string | null
  make: string | null
  model: string | null
}

export async function decodeVin(vin: string): Promise<DecodedVin | null> {
  const cleaned = vin.trim().toUpperCase()
  if (cleaned.length !== 17) return null
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${cleaned}?format=json`)
    if (!res.ok) return null
    const body = await res.json() as { Results?: Array<{ Variable: string; Value: string | null }> }
    const grab = (name: string) => body.Results?.find(r => r.Variable === name)?.Value ?? null
    return { year: grab('Model Year'), make: grab('Make'), model: grab('Model') }
  } catch { return null }
}
```

- [ ] **Step 2:** Create `modernappraisers/src/lib/__tests__/vin-decode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decodeVin } from '@/lib/vin-decode'

describe('decodeVin', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { fetchSpy = vi.spyOn(global, 'fetch' as never) })
  afterEach(() => { fetchSpy.mockRestore() })

  it('returns null for short VINs without hitting the network', async () => {
    const r = await decodeVin('ABC123')
    expect(r).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('parses NHTSA response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ Results: [
      { Variable: 'Model Year', Value: '2020' },
      { Variable: 'Make', Value: 'TOYOTA' },
      { Variable: 'Model', Value: 'Camry' },
    ] }), { status: 200 }) as never)
    const r = await decodeVin('4T1BF1FK5CU000000')  // 17-char dummy
    expect(r).toEqual({ year: '2020', make: 'TOYOTA', model: 'Camry' })
  })

  it('returns null on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }) as never)
    const r = await decodeVin('4T1BF1FK5CU000000')
    expect(r).toBeNull()
  })
})
```

- [ ] **Step 3:** Run `npm test`, expected: 3 pass + prior smoke test. Commit.

```bash
git add modernappraisers/
git commit -m "feat(submit): VIN decode via NHTSA + tests"
```

### Task 5.2: Submit-flow server endpoint — the critical write sequence

**Files:**
- Create: `modernappraisers/src/app/api/submit/route.ts`
- Create: `modernappraisers/src/lib/__tests__/submit-payload.test.ts`
- Create: `modernappraisers/src/lib/submit-payload.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/submit-payload.ts` — the Zod schema that validates a complete submission:

```ts
import { z } from 'zod'

export const SubmitSchema = z.object({
  // Step 1
  vin: z.string().optional(),
  year: z.string().min(2).max(4),
  make: z.string().min(1),
  model: z.string().min(1),
  mileage: z.string().min(1),
  lossAddress: z.string().min(1),
  dateOfLoss: z.string().min(1),             // YYYY-MM-DD
  insuranceCompany: z.string().min(1),
  claimNumber: z.string().min(1),
  // Step 2
  claimType: z.enum(['acv', 'dv', 'estimate', 'not-sure']),
  customerDescription: z.string().max(500).optional().default(''),
  // Step 3 — contact + credentials
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(8),
  verifyMethod: z.enum(['sms', 'email']),
})

export type SubmitPayload = z.infer<typeof SubmitSchema>
```

- [ ] **Step 2:** Create `modernappraisers/src/lib/__tests__/submit-payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SubmitSchema } from '@/lib/submit-payload'

const base = {
  year: '2020', make: 'TOYOTA', model: 'Camry', mileage: '45000',
  lossAddress: '123 Main St, Los Angeles, CA', dateOfLoss: '2026-01-15',
  insuranceCompany: 'Allstate', claimNumber: 'CL-12345',
  claimType: 'acv' as const,
  firstName: 'Alex', lastName: 'Doe', email: 'a@b.co', phone: '+15551234567',
  password: 'password123', verifyMethod: 'email' as const,
}

describe('SubmitSchema', () => {
  it('accepts a full valid payload', () => { expect(SubmitSchema.parse(base).email).toBe('a@b.co') })

  it('rejects a short password', () => {
    const r = SubmitSchema.safeParse({ ...base, password: 'short' })
    expect(r.success).toBe(false)
  })

  it('rejects a bad claimType', () => {
    const r = SubmitSchema.safeParse({ ...base, claimType: 'wat' as never })
    expect(r.success).toBe(false)
  })

  it('rejects a 501-char description', () => {
    const r = SubmitSchema.safeParse({ ...base, customerDescription: 'x'.repeat(501) })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 3:** Run `npm test`, expected: 4 pass + prior. Commit the schema.

```bash
git add modernappraisers/
git commit -m "feat(submit): payload schema + tests"
```

- [ ] **Step 4:** Create `modernappraisers/src/app/api/submit/route.ts` — the main write sequence:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { SubmitSchema } from '@/lib/submit-payload'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// Modern Appraisers company id — same multi-company id used by HAMS.
const MA_COMPANY_ID = '33608ba7-f1b1-492a-830d-e185367cbc73'

export async function POST(req: NextRequest) {
  const parsed = SubmitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid', details: parsed.error.flatten() }, { status: 400 })
  const p = parsed.data

  const sb = createServiceClient()

  // 1. Create auth user. For SMS verification we flag email_confirm=true so the user can log in via phone; the SMS OTP step confirms their phone.
  //    For email verification path, email_confirm=false → Supabase sends magic link.
  const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
    email: p.email, password: p.password, phone: p.phone,
    email_confirm: p.verifyMethod === 'sms',
    user_metadata: { first_name: p.firstName, last_name: p.lastName },
  })
  if (userErr || !userRes.user) return NextResponse.json({ error: userErr?.message ?? 'signup failed' }, { status: 400 })
  const userId = userRes.user.id

  // 2. Insert customer_users row.
  const { error: cuErr } = await sb.from('customer_users').insert({
    id: userId, first_name: p.firstName, last_name: p.lastName, phone: p.phone, email: p.email, verification_method: p.verifyMethod,
  })
  if (cuErr) { await sb.auth.admin.deleteUser(userId).catch(() => {}); return NextResponse.json({ error: cuErr.message }, { status: 400 }) }

  // 3. Insert acv_history row — unassigned, open, in Modern Appraisers company.
  const claimId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const claimTypesArr = p.claimType === 'not-sure' ? [] : [p.claimType]
  const { error: claimErr } = await sb.from('acv_history').insert({
    id: claimId,
    date: new Date().toISOString(),
    mode: 'auto-acv',
    vehicle: `${p.year} ${p.make} ${p.model}`,
    vin: p.vin ?? null,
    status: 'open',
    assigned_to: null,
    company_id: MA_COMPANY_ID,
    claim: {
      year: p.year, make: p.make, model: p.model, vin: p.vin ?? '', mileage: p.mileage,
      lossAddress: p.lossAddress, dateOfLoss: p.dateOfLoss,
      insuranceCompany: p.insuranceCompany, claimNumber: p.claimNumber,
      claimTypes: claimTypesArr,
      insuredName: `${p.firstName} ${p.lastName}`,
      customerDescription: p.customerDescription,
      source: 'customer',
      submittedByCustomerUserId: userId,
    },
  })
  if (claimErr) {
    await sb.from('customer_users').delete().eq('id', userId).catch(() => {})
    await sb.auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: claimErr.message }, { status: 400 })
  }

  // 4. Link user → claim.
  await sb.from('customer_claim_access').insert({ user_id: userId, claim_id: claimId })

  // 5. Auto-post the "describe your situation" blurb as the first HAMS message on this claim.
  if (p.customerDescription && p.customerDescription.trim().length > 0) {
    await sb.from('messages').insert({
      claim_id: claimId,
      company_id: MA_COMPANY_ID,
      body: `[Customer submission]\n\n${p.customerDescription}`,
      is_auto_request: true,
      sender_name: 'Customer Submission',
      sender_id: null,
    }).catch(err => console.error('[submit] auto-message insert failed:', err))
  }

  // 6. Trigger OTP or email verification.
  if (p.verifyMethod === 'sms') {
    await sb.auth.signInWithOtp({ phone: p.phone })
    return NextResponse.json({ ok: true, userId, claimId, next: 'otp', phone: p.phone })
  }
  return NextResponse.json({ ok: true, userId, claimId, next: 'check-email' })
}
```

- [ ] **Step 5:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(submit): server endpoint — full write sequence (auth → claim → access → auto-message → OTP)"
```

### Task 5.3: Submit wizard UI (3 steps)

**Files:**
- Create: `modernappraisers/src/app/submit/page.tsx`
- Create: `modernappraisers/src/app/submit/_wizard/wizard-state.ts`
- Create: `modernappraisers/src/app/submit/_wizard/step1-vehicle.tsx`
- Create: `modernappraisers/src/app/submit/_wizard/step2-details.tsx`
- Create: `modernappraisers/src/app/submit/_wizard/step3-contact.tsx`
- Create: `modernappraisers/src/app/submit/_wizard/progress.tsx`

- [ ] **Step 1:** Create `modernappraisers/src/app/submit/_wizard/wizard-state.ts`:

```ts
export interface WizardState {
  // step 1
  vin: string
  year: string
  make: string
  model: string
  mileage: string
  lossAddress: string
  dateOfLoss: string
  insuranceCompany: string
  claimNumber: string
  // step 2
  claimType: 'acv' | 'dv' | 'estimate' | 'not-sure' | ''
  customerDescription: string
  // step 3
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  passwordConfirm: string
  verifyMethod: 'sms' | 'email'
}

export const initialState: WizardState = {
  vin: '', year: '', make: '', model: '', mileage: '',
  lossAddress: '', dateOfLoss: '', insuranceCompany: '', claimNumber: '',
  claimType: '', customerDescription: '',
  firstName: '', lastName: '', email: '', phone: '', password: '', passwordConfirm: '',
  verifyMethod: 'email',
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/submit/_wizard/progress.tsx`:

```tsx
export function Progress({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Vehicle', 'Details', 'Contact']
  return (
    <div className="flex items-center gap-3 mb-10">
      {labels.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${done ? 'bg-[color:var(--color-ink)] text-white border-[color:var(--color-ink)]' : active ? 'border-[color:var(--color-ink)] text-[color:var(--color-ink)]' : 'border-[color:var(--color-border-strong)] text-[color:var(--color-ink-soft)]'}`}>{done ? '✓' : n}</div>
            <span className={active ? 'font-semibold text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-soft)]'}>{label}</span>
            {n < 3 && <span className="w-10 h-px bg-[color:var(--color-border)]" />}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/submit/_wizard/step1-vehicle.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { decodeVin } from '@/lib/vin-decode'
import type { WizardState } from './wizard-state'

export function Step1Vehicle({ state, setState, onNext }: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void }) {
  const [decoding, setDecoding] = useState(false)
  async function handleDecode() {
    if (!state.vin) return
    setDecoding(true)
    const r = await decodeVin(state.vin)
    setDecoding(false)
    if (r) setState({ ...state, year: r.year ?? state.year, make: r.make ?? state.make, model: r.model ?? state.model })
  }

  const canAdvance = state.year && state.make && state.model && state.mileage && state.lossAddress && state.dateOfLoss && state.insuranceCompany && state.claimNumber
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext() }} className="space-y-5 max-w-2xl">
      <Field label="VIN" hint="Optional — we'll auto-fill year/make/model from the VIN"><div className="flex gap-2"><Input value={state.vin} onChange={e => setState({ ...state, vin: e.target.value })} maxLength={17} /><Button type="button" variant="secondary" onClick={handleDecode} disabled={!state.vin || decoding}>{decoding ? 'Decoding…' : 'Decode'}</Button></div></Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Year" required><Input value={state.year} onChange={e => setState({ ...state, year: e.target.value })} required /></Field>
        <Field label="Make" required><Input value={state.make} onChange={e => setState({ ...state, make: e.target.value })} required /></Field>
        <Field label="Model" required><Input value={state.model} onChange={e => setState({ ...state, model: e.target.value })} required /></Field>
      </div>
      <Field label="Mileage" required><Input type="number" value={state.mileage} onChange={e => setState({ ...state, mileage: e.target.value })} required /></Field>
      <Field label="Loss address" required><Input value={state.lossAddress} onChange={e => setState({ ...state, lossAddress: e.target.value })} placeholder="Street, City, State" required /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date of loss" required><Input type="date" value={state.dateOfLoss} onChange={e => setState({ ...state, dateOfLoss: e.target.value })} required /></Field>
        <Field label="Insurance company" required><Input value={state.insuranceCompany} onChange={e => setState({ ...state, insuranceCompany: e.target.value })} required /></Field>
      </div>
      <Field label="Claim #" required><Input value={state.claimNumber} onChange={e => setState({ ...state, claimNumber: e.target.value })} required /></Field>
      <div className="pt-4"><Button type="submit" disabled={!canAdvance}>Next → Details</Button></div>
    </form>
  )
}
```

- [ ] **Step 4:** Create `modernappraisers/src/app/submit/_wizard/step2-details.tsx`:

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import type { WizardState } from './wizard-state'

export function Step2Details({ state, setState, onNext, onBack }: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const canAdvance = state.claimType !== ''
  const options: { value: WizardState['claimType']; label: string; desc: string }[] = [
    { value: 'acv', label: 'Actual Cash Value', desc: 'Total-loss claim; insurer\'s offer is too low' },
    { value: 'dv', label: 'Diminished Value', desc: 'Vehicle was in an accident and repaired' },
    { value: 'estimate', label: 'Estimate Dispute', desc: 'Repair estimate undershoots the real cost' },
    { value: 'not-sure', label: 'Not sure', desc: 'We\'ll triage based on what you tell us' },
  ]

  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext() }} className="space-y-6 max-w-2xl">
      <fieldset>
        <legend className="block text-sm font-semibold mb-3">Claim type <span className="text-[color:var(--color-danger)]">*</span></legend>
        <div className="space-y-2">
          {options.map(opt => (
            <label key={opt.value} className={`flex items-start gap-3 p-4 border rounded-md cursor-pointer transition-colors ${state.claimType === opt.value ? 'border-[color:var(--color-ink)] bg-[color:var(--color-bg-subtle)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-strong)]'}`}>
              <input type="radio" name="claimType" value={opt.value} checked={state.claimType === opt.value} onChange={() => setState({ ...state, claimType: opt.value })} className="mt-1" />
              <div><div className="font-semibold text-sm">{opt.label}</div><div className="text-xs text-[color:var(--color-ink-muted)] mt-0.5">{opt.desc}</div></div>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Describe your situation" hint="Optional. Up to 500 characters. This posts as the first message on your claim so we have context."><Textarea rows={5} maxLength={500} value={state.customerDescription} onChange={e => setState({ ...state, customerDescription: e.target.value })} /></Field>

      <div className="flex items-center gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onBack}>← Back</Button>
        <Button type="submit" disabled={!canAdvance}>Next → Contact</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5:** Create `modernappraisers/src/app/submit/_wizard/step3-contact.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import type { WizardState } from './wizard-state'

export function Step3Contact({ state, setState, onBack }: { state: WizardState; setState: (s: WizardState) => void; onBack: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSubmit = state.firstName && state.lastName && state.email && state.phone && state.password && state.password === state.passwordConfirm && state.password.length >= 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { passwordConfirm: _pc, ...payload } = state
    const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false)
    if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Submission failed'); return }
    const body = await res.json()
    if (body.next === 'otp') router.push(`/verify-otp?phone=${encodeURIComponent(body.phone)}&next=/portal/claims/${body.claimId}`)
    else if (body.next === 'check-email') router.push(`/submit/sent?email=${encodeURIComponent(state.email)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name" required><Input value={state.firstName} onChange={e => setState({ ...state, firstName: e.target.value })} required /></Field>
        <Field label="Last name" required><Input value={state.lastName} onChange={e => setState({ ...state, lastName: e.target.value })} required /></Field>
      </div>
      <Field label="Email" required hint="This becomes your login"><Input type="email" value={state.email} onChange={e => setState({ ...state, email: e.target.value })} required /></Field>
      <Field label="Phone" required hint="For verification + we may call about your claim"><Input type="tel" value={state.phone} onChange={e => setState({ ...state, phone: e.target.value })} required /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Password" required><Input type="password" value={state.password} onChange={e => setState({ ...state, password: e.target.value })} required minLength={8} /></Field>
        <Field label="Confirm password" required><Input type="password" value={state.passwordConfirm} onChange={e => setState({ ...state, passwordConfirm: e.target.value })} required /></Field>
      </div>

      <fieldset className="pt-2">
        <legend className="block text-sm font-semibold mb-3">Verify with</legend>
        <div className="flex gap-3">
          <label className={`flex-1 p-3 border rounded-md cursor-pointer text-center text-sm font-semibold ${state.verifyMethod === 'email' ? 'border-[color:var(--color-ink)] bg-[color:var(--color-bg-subtle)]' : 'border-[color:var(--color-border)]'}`}>
            <input type="radio" name="verify" checked={state.verifyMethod === 'email'} onChange={() => setState({ ...state, verifyMethod: 'email' })} className="hidden" />Email link
          </label>
          <label className={`flex-1 p-3 border rounded-md cursor-pointer text-center text-sm font-semibold ${state.verifyMethod === 'sms' ? 'border-[color:var(--color-ink)] bg-[color:var(--color-bg-subtle)]' : 'border-[color:var(--color-border)]'}`}>
            <input type="radio" name="verify" checked={state.verifyMethod === 'sms'} onChange={() => setState({ ...state, verifyMethod: 'sms' })} className="hidden" />SMS code
          </label>
        </div>
      </fieldset>

      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

      <div className="flex items-center gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onBack}>← Back</Button>
        <Button type="submit" disabled={!canSubmit || busy}>{busy ? 'Submitting…' : 'Submit claim'}</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 6:** Create `modernappraisers/src/app/submit/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Container } from '@/components/container'
import { Progress } from './_wizard/progress'
import { Step1Vehicle } from './_wizard/step1-vehicle'
import { Step2Details } from './_wizard/step2-details'
import { Step3Contact } from './_wizard/step3-contact'
import { initialState, type WizardState } from './_wizard/wizard-state'

export default function SubmitPage() {
  const [state, setState] = useState<WizardState>(initialState)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  return (
    <main className="py-16">
      <Container>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Submit a claim</h1>
        <p className="text-[color:var(--color-ink-muted)] mb-10">Takes under three minutes. Account auto-creates on submit.</p>
        <Progress step={step} />
        {step === 1 && <Step1Vehicle state={state} setState={setState} onNext={() => setStep(2)} />}
        {step === 2 && <Step2Details state={state} setState={setState} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3Contact state={state} setState={setState} onBack={() => setStep(2)} />}
      </Container>
    </main>
  )
}
```

- [ ] **Step 7:** Create `modernappraisers/src/app/submit/sent/page.tsx` (email-verify waiting state):

```tsx
import { Container } from '@/components/container'
import Link from 'next/link'

export default async function SubmissionSentPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  return (
    <main className="py-20">
      <Container>
        <div className="max-w-xl">
          <h1 className="text-3xl font-bold tracking-tight mb-4">Check your email</h1>
          <p className="text-[color:var(--color-ink-muted)] mb-6">We sent a verification link to <span className="font-semibold text-[color:var(--color-ink)]">{email ?? 'your email'}</span>. Click it to activate your account and view your claim.</p>
          <p className="text-sm text-[color:var(--color-ink-soft)]">Didn't get it? Check spam, or <Link className="font-semibold text-[color:var(--color-accent-ink)]" href="/submit">try again</Link>.</p>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 8:** Visually walk through the wizard end-to-end on localhost. Commit.

```bash
git add modernappraisers/
git commit -m "feat(submit): 3-step wizard UI — vehicle, details, contact"
```

### Task 5.4: Document upload during submit (deferred to V1.5 — stub only)

**Files:** none — explicitly left out of V1 to keep the submit path minimal. Captured in the spec's "out of scope" and in the plan footer. Document uploads land in the customer portal post-signup (Task 6.3) instead.

- [ ] **Step 1:** No code; just acknowledge the scope decision in the plan footer.

---

## Phase 6 — Customer portal

### Task 6.1: Portal shell + claim list

**Files:**
- Create: `modernappraisers/src/app/portal/layout.tsx`
- Create: `modernappraisers/src/app/portal/page.tsx`
- Create: `modernappraisers/src/lib/db/claims.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/db/claims.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { AcvHistoryRow } from './types'

export async function fetchMyClaims(userId: string): Promise<AcvHistoryRow[]> {
  const sb = await createClient()
  const { data: access } = await sb.from('customer_claim_access').select('claim_id').eq('user_id', userId)
  if (!access?.length) return []
  const ids = access.map(a => a.claim_id)
  const { data } = await sb.from('acv_history').select('id, ma_number, status, closed_at, assigned_to, status_phase, status_phase_set_at, created_at, claim').in('id', ids).order('created_at', { ascending: false })
  return (data as AcvHistoryRow[]) ?? []
}

export async function fetchMyClaim(userId: string, claimId: string): Promise<AcvHistoryRow | null> {
  const sb = await createClient()
  const { data: access } = await sb.from('customer_claim_access').select('claim_id').eq('user_id', userId).eq('claim_id', claimId).maybeSingle()
  if (!access) return null
  const { data } = await sb.from('acv_history').select('id, ma_number, status, closed_at, assigned_to, status_phase, status_phase_set_at, created_at, claim').eq('id', claimId).maybeSingle()
  return (data as AcvHistoryRow | null) ?? null
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/portal/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container } from '@/components/container'
import { getCurrentCustomer } from '@/lib/auth/current-customer'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const cu = await getCurrentCustomer()
  if (!cu) redirect('/login')
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-subtle)]">
      <nav className="bg-white border-b border-[color:var(--color-border)]">
        <Container className="h-14 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <Link href="/portal" className="font-semibold">My Claims</Link>
            <Link href="/portal/claims/new" className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">Submit another</Link>
            <Link href="/portal/account" className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">Account</Link>
          </div>
          <form action="/api/auth/logout" method="post"><button className="text-sm text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]">Logout</button></form>
        </Container>
      </nav>
      <main className="py-10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/portal/page.tsx`:

```tsx
import Link from 'next/link'
import { Container } from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { getCurrentCustomer } from '@/lib/auth/current-customer'
import { fetchMyClaims } from '@/lib/db/claims'

export default async function PortalHomePage() {
  const cu = (await getCurrentCustomer())!
  const claims = await fetchMyClaims(cu.id)
  return (
    <Container>
      <h1 className="text-3xl font-bold tracking-tight mb-8">My claims</h1>
      {claims.length === 0 ? (
        <div className="p-10 bg-white border border-[color:var(--color-border)] rounded-[10px] text-center text-[color:var(--color-ink-muted)]">
          No claims yet. <Link href="/portal/claims/new" className="font-semibold text-[color:var(--color-accent-ink)]">Submit one</Link>.
        </div>
      ) : (
        <div className="bg-white border border-[color:var(--color-border)] rounded-[10px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-bg-subtle)] text-xs font-semibold text-[color:var(--color-ink-soft)] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">MA#</th>
                <th className="text-left px-4 py-3">Vehicle</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 font-mono font-semibold">{c.ma_number ?? '—'}</td>
                  <td className="px-4 py-3">{[c.claim.year, c.claim.make, c.claim.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-3">{c.status === 'closed' ? <Badge tone="neutral">Closed</Badge> : <Badge tone="accent">Open</Badge>}</td>
                  <td className="px-4 py-3 text-[color:var(--color-ink-muted)]">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/portal/claims/${c.id}`} className="font-semibold text-[color:var(--color-accent-ink)]">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  )
}
```

- [ ] **Step 4:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(portal): layout + claims list"
```

### Task 6.2: Claim detail — 4 tabs (Details / Status / Documents / Messages)

**Files:**
- Create: `modernappraisers/src/app/portal/claims/[id]/page.tsx`
- Create: `modernappraisers/src/app/portal/claims/[id]/_tabs.tsx`
- Create: `modernappraisers/src/app/portal/claims/[id]/_messages.tsx`
- Create: `modernappraisers/src/app/portal/claims/[id]/_documents.tsx`
- Create: `modernappraisers/src/app/portal/claims/[id]/_status.tsx`
- Create: `modernappraisers/src/app/portal/claims/[id]/_details.tsx`
- Create: `modernappraisers/src/app/api/portal/messages/route.ts`
- Create: `modernappraisers/src/app/api/portal/upload/route.ts`

- [ ] **Step 1:** Create `_details.tsx`:

```tsx
import type { AcvHistoryRow } from '@/lib/db/types'

export function DetailsPanel({ claim }: { claim: AcvHistoryRow }) {
  const row = (label: string, value: unknown) => (
    <div className="grid grid-cols-[180px_1fr] gap-4 py-3 border-b border-[color:var(--color-border)] text-sm last:border-b-0">
      <div className="text-[color:var(--color-ink-soft)]">{label}</div>
      <div className="text-[color:var(--color-ink)]">{value ? String(value) : <span className="text-[color:var(--color-ink-soft)]">—</span>}</div>
    </div>
  )
  const c = claim.claim
  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Vehicle</h2>
      {row('Year', c.year)}
      {row('Make', c.make)}
      {row('Model', c.model)}
      {row('VIN', c.vin)}
      {row('Mileage', c.mileage)}

      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mt-10 mb-4">Loss</h2>
      {row('Date of loss', c.dateOfLoss)}
      {row('Loss address', c.lossAddress)}

      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mt-10 mb-4">Insurance</h2>
      {row('Insurance company', c.insuranceCompany)}
      {row('Claim #', c.claimNumber)}
    </div>
  )
}
```

- [ ] **Step 2:** Create `_status.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { AcvHistoryRow } from '@/lib/db/types'

export function StatusPanel({ claim }: { claim: AcvHistoryRow }) {
  const events: { date: string; label: string }[] = []
  events.push({ date: claim.created_at, label: 'Claim submitted' })
  if (claim.status_phase && claim.status_phase_set_at) events.push({ date: claim.status_phase_set_at, label: `Phase: ${claim.status_phase}` })
  if (claim.closed_at) events.push({ date: claim.closed_at, label: 'Claim closed' })

  const sorted = events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)]">Current status</span>
        {claim.status === 'closed' ? <Badge tone="neutral">Closed</Badge> : <Badge tone="accent">Open · {claim.status_phase ?? 'In triage'}</Badge>}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Timeline</h2>
      <ol className="space-y-3">
        {sorted.map((e, i) => (
          <li key={i} className="flex gap-4 text-sm">
            <div className="text-[color:var(--color-ink-soft)] w-28 tabular-nums">{new Date(e.date).toLocaleDateString()}</div>
            <div>{e.label}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 3:** Create `_messages.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CustomerMessageRow } from '@/lib/db/types'

export function MessagesPanel({ claimId }: { claimId: string }) {
  const [msgs, setMsgs] = useState<CustomerMessageRow[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await fetch(`/api/portal/messages?claimId=${claimId}`)
    if (r.ok) setMsgs((await r.json()).messages ?? [])
  }
  useEffect(() => { load() }, [claimId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!body.trim()) return
    setBusy(true)
    await fetch('/api/portal/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId, body }) })
    setBody(''); setBusy(false); await load()
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Messages</h2>
      <ol className="space-y-4 mb-6">
        {msgs.length === 0 && <li className="text-sm text-[color:var(--color-ink-soft)]">No messages yet. Send one to open the thread.</li>}
        {msgs.map(m => (
          <li key={m.id} className={`p-4 rounded-md ${m.sender_type === 'admin' ? 'bg-[color:var(--color-bg-subtle)]' : 'bg-sky-50'}`}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">{m.sender_type === 'admin' ? 'Modern Appraisers' : 'You'}</span>
              <span className="text-xs text-[color:var(--color-ink-soft)]">{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <Textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Message Modern Appraisers…" />
        <Button onClick={send} disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4:** Create `_documents.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { CustomerClaimDocumentRow } from '@/lib/db/types'

export function DocumentsPanel({ claimId }: { claimId: string }) {
  const [docs, setDocs] = useState<CustomerClaimDocumentRow[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await fetch(`/api/portal/documents?claimId=${claimId}`)
    if (r.ok) setDocs((await r.json()).documents ?? [])
  }
  useEffect(() => { load() }, [claimId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const fd = new FormData(); fd.append('file', file); fd.append('claimId', claimId)
    await fetch('/api/portal/upload', { method: 'POST', body: fd })
    e.target.value = ''
    setBusy(false); await load()
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Documents</h2>
      {docs.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-soft)] mb-6">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)] mb-6">
          {docs.map(d => (
            <li key={d.id} className="py-3 flex items-center justify-between text-sm">
              <div><div className="font-medium">{d.file_name}</div><div className="text-xs text-[color:var(--color-ink-soft)]">{d.uploaded_by_type === 'admin' ? 'Shared by Modern Appraisers' : 'You uploaded'} · {new Date(d.created_at).toLocaleDateString()}</div></div>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-block">
        <input type="file" className="sr-only" onChange={handleUpload} disabled={busy} />
        <span className="inline-flex items-center h-10 px-5 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold cursor-pointer hover:bg-black">{busy ? 'Uploading…' : 'Upload a file'}</span>
      </label>
    </div>
  )
}
```

- [ ] **Step 5:** Create `_tabs.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { AcvHistoryRow } from '@/lib/db/types'
import { DetailsPanel } from './_details'
import { StatusPanel } from './_status'
import { MessagesPanel } from './_messages'
import { DocumentsPanel } from './_documents'

export function ClaimTabs({ claim }: { claim: AcvHistoryRow }) {
  const [tab, setTab] = useState<'details'|'status'|'documents'|'messages'>('details')
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'status', label: 'Status' },
    { id: 'documents', label: 'Documents' },
    { id: 'messages', label: 'Messages' },
  ]
  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-[10px] overflow-hidden">
      <div className="flex border-b border-[color:var(--color-border)]">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 h-12 text-sm font-semibold ${tab === t.id ? 'text-[color:var(--color-ink)] border-b-2 border-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'details' && <DetailsPanel claim={claim} />}
      {tab === 'status' && <StatusPanel claim={claim} />}
      {tab === 'documents' && <DocumentsPanel claimId={claim.id} />}
      {tab === 'messages' && <MessagesPanel claimId={claim.id} />}
    </div>
  )
}
```

- [ ] **Step 6:** Create `modernappraisers/src/app/portal/claims/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { Container } from '@/components/container'
import { getCurrentCustomer } from '@/lib/auth/current-customer'
import { fetchMyClaim } from '@/lib/db/claims'
import { ClaimTabs } from './_tabs'

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cu = (await getCurrentCustomer())!
  const claim = await fetchMyClaim(cu.id, id)
  if (!claim) notFound()

  return (
    <Container>
      <div className="flex items-baseline gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Claim {claim.ma_number ?? ''}</h1>
        <span className="text-sm text-[color:var(--color-ink-soft)]">{[claim.claim.year, claim.claim.make, claim.claim.model].filter(Boolean).join(' ')}</span>
      </div>
      <ClaimTabs claim={claim} />
    </Container>
  )
}
```

- [ ] **Step 7:** Create `modernappraisers/src/app/api/portal/messages/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const claimId = req.nextUrl.searchParams.get('claimId')
  if (!claimId) return NextResponse.json({ error: 'claimId required' }, { status: 400 })
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { data } = await sb.from('customer_messages').select('*').eq('claim_id', claimId).order('created_at', { ascending: true })
  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { claimId?: string; body?: string } | null
  if (!body?.claimId || !body?.body?.trim()) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { error } = await sb.from('customer_messages').insert({ claim_id: body.claimId, sender_type: 'customer', sender_user_id: user.id, body: body.body.trim() })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8:** Create `modernappraisers/src/app/api/portal/documents/route.ts` + upload route:

```ts
// documents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const claimId = req.nextUrl.searchParams.get('claimId')
  if (!claimId) return NextResponse.json({ error: 'claimId required' }, { status: 400 })
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const { data } = await sb.from('customer_claim_documents').select('*').eq('claim_id', claimId).order('created_at', { ascending: false })
  return NextResponse.json({ documents: data ?? [] })
}
```

```ts
// upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED = new Set(['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const MAX_BYTES = 25 * 1024 * 1024

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const fd = await req.formData()
  const claimId = fd.get('claimId') as string | null
  const file = fd.get('file') as File | null
  if (!claimId || !file) return NextResponse.json({ error: 'claimId + file required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'file too large (max 25 MB)' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'unsupported type' }, { status: 400 })

  const key = `${claimId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await sb.storage.from('customer-shared').upload(key, buf, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  const { error: dbErr } = await sb.from('customer_claim_documents').insert({
    claim_id: claimId, uploaded_by_user_id: user.id, uploaded_by_type: 'customer',
    file_path: key, file_name: file.name, file_size_bytes: file.size, mime_type: file.type,
  })
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, key })
}
```

- [ ] **Step 9:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(portal): claim detail — Details/Status/Documents/Messages tabs + APIs"
```

### Task 6.3: Account page + logout + password change

**Files:**
- Create: `modernappraisers/src/app/portal/account/page.tsx`
- Create: `modernappraisers/src/app/api/portal/change-password/route.ts`

- [ ] **Step 1:** Create `modernappraisers/src/app/portal/account/page.tsx` (client component — simple form, posts to change-password API, logout button is in layout already):

```tsx
'use client'
import { useState } from 'react'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export default function AccountPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null); setErr(null)
    if (next !== confirm) { setBusy(false); setErr('New passwords do not match'); return }
    const r = await fetch('/api/portal/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current, next }) })
    setBusy(false)
    if (!r.ok) { const b = await r.json().catch(() => ({})); setErr(b.error ?? 'Failed'); return }
    setMsg('Password updated'); setCurrent(''); setNext(''); setConfirm('')
  }

  return (
    <Container>
      <h1 className="text-3xl font-bold tracking-tight mb-8">Account</h1>
      <form onSubmit={submit} className="space-y-5 max-w-md bg-white p-6 border border-[color:var(--color-border)] rounded-[10px]">
        <h2 className="font-semibold">Change password</h2>
        <Field label="Current password"><Input type="password" value={current} onChange={e => setCurrent(e.target.value)} required /></Field>
        <Field label="New password" hint="At least 8 characters"><Input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={8} /></Field>
        <Field label="Confirm new password"><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></Field>
        {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
      </form>
    </Container>
  )
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/api/portal/change-password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Schema = z.object({ current: z.string().min(1), next: z.string().min(8) })

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  // Re-authenticate with the current password.
  const { error: pw } = await sb.auth.signInWithPassword({ email: user.email, password: parsed.data.current })
  if (pw) return NextResponse.json({ error: 'Current password is wrong' }, { status: 400 })

  const { error: upd } = await sb.auth.updateUser({ password: parsed.data.next })
  if (upd) return NextResponse.json({ error: upd.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(portal): account page + change-password API"
```

### Task 6.4: Portal "submit another" short form

**Files:**
- Create: `modernappraisers/src/app/portal/claims/new/page.tsx`

- [ ] **Step 1:** This reuses the Phase-5 wizard but pre-populates contact fields and skips Step 3's auth creation (user is already signed in). For V1, keep it simple: redirect to `/submit` with a note that returning-customer short-form is V1.5.

```tsx
import { redirect } from 'next/navigation'
import { getCurrentCustomer } from '@/lib/auth/current-customer'

export default async function PortalNewClaimPage() {
  const cu = await getCurrentCustomer()
  if (!cu) redirect('/login')
  // V1: send them through the normal submit flow — they'll hit a duplicate-email error
  // on the auth-create step, which we catch to transparently attach the new claim to
  // their existing account. V1.5: build a pre-filled, auth-skipping short form here.
  redirect('/submit')
}
```

- [ ] **Step 2:** Modify `modernappraisers/src/app/api/submit/route.ts` to handle the "user already exists" case: if `createUser` fails with duplicate-email AND the caller is authenticated AND the auth user matches, skip user creation and insert the claim + access row only. Add a second branch at the top of the handler.

```ts
// Before the auth.admin.createUser call, check for an existing session:
const sbSession = await (await import('@/lib/supabase/server')).createClient()
const { data: { user: sessionUser } } = await sbSession.auth.getUser()
if (sessionUser) {
  // Returning customer: skip auth creation; just insert the claim + access.
  // (customer_users row already exists from prior submit.)
  const claimId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const claimTypesArr = p.claimType === 'not-sure' ? [] : [p.claimType]
  const { error: claimErr } = await sb.from('acv_history').insert({
    id: claimId, date: new Date().toISOString(), mode: 'auto-acv',
    vehicle: `${p.year} ${p.make} ${p.model}`, vin: p.vin ?? null,
    status: 'open', assigned_to: null, company_id: MA_COMPANY_ID,
    claim: {
      year: p.year, make: p.make, model: p.model, vin: p.vin ?? '', mileage: p.mileage,
      lossAddress: p.lossAddress, dateOfLoss: p.dateOfLoss,
      insuranceCompany: p.insuranceCompany, claimNumber: p.claimNumber,
      claimTypes: claimTypesArr, insuredName: `${p.firstName} ${p.lastName}`,
      customerDescription: p.customerDescription, source: 'customer',
      submittedByCustomerUserId: sessionUser.id,
    },
  })
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 400 })
  await sb.from('customer_claim_access').insert({ user_id: sessionUser.id, claim_id: claimId })
  if (p.customerDescription?.trim()) {
    await sb.from('messages').insert({
      claim_id: claimId, company_id: MA_COMPANY_ID,
      body: `[Customer submission]\n\n${p.customerDescription}`,
      is_auto_request: true, sender_name: 'Customer Submission', sender_id: null,
    }).catch(err => console.error('[submit] auto-message insert failed:', err))
  }
  return NextResponse.json({ ok: true, userId: sessionUser.id, claimId, next: 'portal' })
}
```

Then in the wizard's Step3 handler, if `body.next === 'portal'` redirect to `/portal/claims/${body.claimId}`.

- [ ] **Step 3:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(portal): returning customer re-submit flow (skips auth create)"
```

---

## Phase 7 — Staff reply surface

### Task 7.1: Staff login + inbox

**Files:**
- Create: `modernappraisers/src/app/staff/login/page.tsx`
- Create: `modernappraisers/src/app/staff/layout.tsx`
- Create: `modernappraisers/src/app/staff/page.tsx` (inbox)
- Create: `modernappraisers/src/lib/auth/current-staff.ts`

- [ ] **Step 1:** Create `modernappraisers/src/lib/auth/current-staff.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface StaffProfile { id: string; role: 'admin' | 'appraiser'; name: string | null; email: string | null }

export async function getCurrentStaff(): Promise<StaffProfile | null> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const svc = createServiceClient()
  const { data } = await svc.from('profiles').select('id, role, name, email').eq('id', user.id).maybeSingle()
  if (!data || !['admin','appraiser'].includes(data.role)) return null
  return data as StaffProfile
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/staff/login/page.tsx` — mirrors `/login` but routes to `/staff/inbox` on success. Reuse the same `/api/auth/login` endpoint:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container } from '@/components/container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export default function StaffLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    setBusy(false)
    if (!r.ok) { setError('Invalid credentials'); return }
    router.push('/staff'); router.refresh()
  }

  return (
    <main className="py-20">
      <Container>
        <div className="max-w-md mx-auto">
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Staff</p>
          <h1 className="text-3xl font-bold tracking-tight mb-8">Sign in</h1>
          <form onSubmit={submit} className="space-y-5">
            <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
            {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </div>
      </Container>
    </main>
  )
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/staff/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container } from '@/components/container'
import { getCurrentStaff } from '@/lib/auth/current-staff'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const s = await getCurrentStaff()
  if (!s) redirect('/staff/login')
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-subtle)]">
      <nav className="bg-white border-b border-[color:var(--color-border)]">
        <Container className="h-14 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <Link href="/staff" className="font-semibold">Inbox</Link>
            <a href={`${process.env.HAMSPORTAL_URL ?? 'https://hamsportal.com'}`} target="_blank" rel="noreferrer" className="text-[color:var(--color-ink-muted)]">Open HAMS ↗</a>
          </div>
          <form action="/api/auth/logout" method="post"><button className="text-sm text-[color:var(--color-ink-muted)]">Logout</button></form>
        </Container>
      </nav>
      <main className="py-10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4:** Create `modernappraisers/src/app/staff/page.tsx`:

```tsx
import Link from 'next/link'
import { Container } from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentStaff } from '@/lib/auth/current-staff'

export default async function StaffInboxPage() {
  await getCurrentStaff()
  const svc = createServiceClient()

  // Claims with at least one customer message, ordered by most recent customer post.
  const { data: msgs } = await svc.from('customer_messages').select('claim_id, body, created_at, sender_type').order('created_at', { ascending: false }).limit(200)
  const seen = new Set<string>()
  const latestByClaim = (msgs ?? []).filter(m => (seen.has(m.claim_id) ? false : (seen.add(m.claim_id), true)))

  if (latestByClaim.length === 0) {
    return <Container><p className="text-sm text-[color:var(--color-ink-soft)]">No customer messages yet.</p></Container>
  }

  const claimIds = latestByClaim.map(m => m.claim_id)
  const { data: claims } = await svc.from('acv_history').select('id, ma_number, claim').in('id', claimIds)
  const claimMap = new Map((claims ?? []).map(c => [c.id, c]))

  return (
    <Container>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Customer inbox</h1>
      <div className="bg-white border border-[color:var(--color-border)] rounded-[10px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-bg-subtle)] text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)]"><tr><th className="px-4 py-3 text-left">MA#</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Last message</th><th className="px-4 py-3 text-left">When</th><th /></tr></thead>
          <tbody>
            {latestByClaim.map(m => {
              const c = claimMap.get(m.claim_id)
              const customerName = (c?.claim as { insuredName?: string } | undefined)?.insuredName ?? '—'
              return (
                <tr key={m.claim_id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 font-mono font-semibold">{c?.ma_number ?? '—'}</td>
                  <td className="px-4 py-3">{customerName}</td>
                  <td className="px-4 py-3 text-[color:var(--color-ink-muted)] max-w-md truncate">{m.body}</td>
                  <td className="px-4 py-3 text-[color:var(--color-ink-soft)]">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/staff/claims/${m.claim_id}`} className="font-semibold text-[color:var(--color-accent-ink)]">Open →</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Container>
  )
}
```

- [ ] **Step 5:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(staff): login + inbox"
```

### Task 7.2: Staff claim detail — reply + share documents

**Files:**
- Create: `modernappraisers/src/app/staff/claims/[id]/page.tsx`
- Create: `modernappraisers/src/app/api/staff/messages/route.ts`
- Create: `modernappraisers/src/app/api/staff/upload/route.ts`

- [ ] **Step 1:** Create `modernappraisers/src/app/api/staff/messages/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentStaff } from '@/lib/auth/current-staff'

export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const body = await req.json().catch(() => null) as { claimId?: string; body?: string } | null
  if (!body?.claimId || !body?.body?.trim()) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const svc = createServiceClient()
  const { error } = await svc.from('customer_messages').insert({ claim_id: body.claimId, sender_type: 'admin', sender_user_id: staff.id, body: body.body.trim() })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2:** Create `modernappraisers/src/app/api/staff/upload/route.ts` (mirrors portal upload but marks `uploaded_by_type='admin'`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentStaff } from '@/lib/auth/current-staff'

const ALLOWED = new Set(['application/pdf','image/jpeg','image/png','image/webp'])
const MAX_BYTES = 25 * 1024 * 1024

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return NextResponse.json({ error: 'unauth' }, { status: 401 })
  const fd = await req.formData()
  const claimId = fd.get('claimId') as string | null
  const file = fd.get('file') as File | null
  if (!claimId || !file) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too large' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'unsupported type' }, { status: 400 })

  const svc = createServiceClient()
  const key = `${claimId}/admin-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await svc.storage.from('customer-shared').upload(key, buf, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  const { error: dbErr } = await svc.from('customer_claim_documents').insert({
    claim_id: claimId, uploaded_by_user_id: staff.id, uploaded_by_type: 'admin',
    file_path: key, file_name: file.name, file_size_bytes: file.size, mime_type: file.type,
  })
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, key })
}
```

- [ ] **Step 3:** Create `modernappraisers/src/app/staff/claims/[id]/page.tsx` — reuses customer-portal panels but with the staff-side POST endpoints. For brevity, we inline a smaller version here showing messages + upload + a link to HAMS:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Container } from '@/components/container'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentStaff } from '@/lib/auth/current-staff'
import { StaffReplyPanel } from './_reply'

export default async function StaffClaimPage({ params }: { params: Promise<{ id: string }> }) {
  await getCurrentStaff()
  const { id } = await params
  const svc = createServiceClient()
  const { data: claim } = await svc.from('acv_history').select('id, ma_number, claim').eq('id', id).maybeSingle()
  if (!claim) notFound()

  const { data: msgs } = await svc.from('customer_messages').select('*').eq('claim_id', id).order('created_at', { ascending: true })
  const { data: docs } = await svc.from('customer_claim_documents').select('*').eq('claim_id', id).order('created_at', { ascending: false })
  const customerDescription = (claim.claim as { customerDescription?: string }).customerDescription
  const insured = (claim.claim as { insuredName?: string }).insuredName

  return (
    <Container>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Claim {claim.ma_number ?? ''}</h1>
          <p className="text-sm text-[color:var(--color-ink-soft)]">{insured}</p>
        </div>
        <a href={`${process.env.HAMSPORTAL_URL ?? 'https://hamsportal.com'}/claims/${id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[color:var(--color-accent-ink)]">Open in HAMS ↗</a>
      </div>

      {customerDescription && (
        <div className="mb-6 p-5 bg-[color:var(--color-bg-subtle)] border border-[color:var(--color-border)] rounded-[10px]">
          <h2 className="text-xs uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-2">Customer's description</h2>
          <p className="text-sm whitespace-pre-wrap">{customerDescription}</p>
        </div>
      )}

      <StaffReplyPanel claimId={id} initialMessages={msgs ?? []} initialDocs={docs ?? []} />
    </Container>
  )
}
```

- [ ] **Step 4:** Create `modernappraisers/src/app/staff/claims/[id]/_reply.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CustomerMessageRow, CustomerClaimDocumentRow } from '@/lib/db/types'

export function StaffReplyPanel({ claimId, initialMessages, initialDocs }: { claimId: string; initialMessages: CustomerMessageRow[]; initialDocs: CustomerClaimDocumentRow[] }) {
  const [msgs, setMsgs] = useState(initialMessages)
  const [docs, setDocs] = useState(initialDocs)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function send() {
    if (!body.trim()) return
    setSending(true)
    const r = await fetch('/api/staff/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId, body }) })
    if (r.ok) { setBody(''); const freshR = await fetch(`/api/portal/messages?claimId=${claimId}`); setMsgs((await freshR.json()).messages ?? []) }
    setSending(false)
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.append('file', file); fd.append('claimId', claimId)
    const r = await fetch('/api/staff/upload', { method: 'POST', body: fd })
    if (r.ok) { const freshR = await fetch(`/api/portal/documents?claimId=${claimId}`); setDocs((await freshR.json()).documents ?? []) }
    e.target.value = ''; setUploading(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <section className="bg-white border border-[color:var(--color-border)] rounded-[10px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Thread</h2>
        <ol className="space-y-4 mb-6">
          {msgs.length === 0 && <li className="text-sm text-[color:var(--color-ink-soft)]">No messages yet.</li>}
          {msgs.map(m => (
            <li key={m.id} className={`p-4 rounded-md ${m.sender_type === 'admin' ? 'bg-sky-50' : 'bg-[color:var(--color-bg-subtle)]'}`}>
              <div className="flex items-baseline justify-between mb-1"><span className="text-xs font-semibold uppercase tracking-wider">{m.sender_type === 'admin' ? 'You' : 'Customer'}</span><span className="text-xs text-[color:var(--color-ink-soft)]">{new Date(m.created_at).toLocaleString()}</span></div>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
        <div className="space-y-3">
          <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Reply to customer…" />
          <Button onClick={send} disabled={sending || !body.trim()}>{sending ? 'Sending…' : 'Send reply'}</Button>
        </div>
      </section>

      <section className="bg-white border border-[color:var(--color-border)] rounded-[10px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)] mb-4">Shared files</h2>
        <ul className="divide-y divide-[color:var(--color-border)] mb-4">
          {docs.length === 0 && <li className="py-2 text-sm text-[color:var(--color-ink-soft)]">No files yet.</li>}
          {docs.map(d => (
            <li key={d.id} className="py-3 text-sm">
              <div className="font-medium">{d.file_name}</div>
              <div className="text-xs text-[color:var(--color-ink-soft)]">{d.uploaded_by_type === 'admin' ? 'You uploaded' : 'Customer uploaded'} · {new Date(d.created_at).toLocaleDateString()}</div>
            </li>
          ))}
        </ul>
        <label className="inline-block">
          <input type="file" className="sr-only" onChange={upload} disabled={uploading} />
          <span className="inline-flex items-center h-10 px-4 rounded-md bg-[color:var(--color-ink)] text-white text-sm font-semibold cursor-pointer hover:bg-black">{uploading ? 'Uploading…' : 'Share a file'}</span>
        </label>
      </section>
    </div>
  )
}
```

- [ ] **Step 5:** Commit.

```bash
git add modernappraisers/
git commit -m "feat(staff): claim detail — reply + share file"
```

---

## Phase 8 — Final polish + verification

### Task 8.1: Document in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — add a short note about modernappraisers.com, the font-rule scope clarification, and the migration prerequisites

- [ ] **Step 1:** Append the following to `CLAUDE.md` (after the Standing Rules section):

```markdown
## modernappraisers.com (sibling app)

`modernappraisers/` is a standalone Next.js app for the public-facing Modern Appraisers website + customer portal + staff reply surface. Zero shared code with HamsPortal. Both apps hit the same Supabase project but modernappraisers.com writes only to:
- `acv_history` (INSERT only — unassigned open rows, customer-submitted claims)
- `messages` (INSERT only — one auto-message per customer submission containing the "describe your situation" blurb)
- new tables: `customer_users`, `customer_claim_access`, `customer_messages`, `customer_claim_documents`
- new storage bucket: `customer-shared`

**Times New Roman font rule in CLAUDE.md applies to HamsPortal only.** modernappraisers.com uses Inter — this is intentional, documented in the site design spec at `docs/superpowers/specs/2026-10-11-modernappraisers-site-design.md`.

Dev: `cd modernappraisers && npm run dev` → `http://localhost:3100` (HamsPortal stays on :3000).
```

- [ ] **Step 2:** Commit.

```bash
git add CLAUDE.md
git commit -m "docs(claude): document modernappraisers.com sibling app + font-rule scope"
```

### Task 8.2: End-to-end smoke run

- [ ] **Step 1:** With HAMS Supabase SQL editor, run `supabase/migration-modernappraisers.sql`. Verify all tables + bucket + RLS policies exist via `select * from pg_tables where tablename like 'customer_%'`.

- [ ] **Step 2:** Start both apps in parallel:

```bash
# Terminal 1
npm run dev
# Terminal 2
cd modernappraisers && npm run dev
```

Expected: HAMS on `:3000`, modernappraisers on `:3100`, both load without error.

- [ ] **Step 3:** Submit a test claim through the wizard. Verify:
  - `/submit` wizard completes
  - email verification link arrives (or SMS code arrives if phone path)
  - account auto-creates in `customer_users`
  - new claim appears in HAMS's New Assignments tab (visit `http://localhost:3000` — the claim should be visible)
  - the "describe your situation" blurb appears as the first message in the claim's HAMS message thread

- [ ] **Step 4:** Sign in as the test customer at `http://localhost:3100/login` with the credentials used during submit. Verify:
  - `/portal` shows the claim
  - clicking in opens the detail with 4 tabs
  - message send → appears in `/staff/inbox`

- [ ] **Step 5:** Sign in as a HAMS admin at `http://localhost:3100/staff/login`. Verify:
  - `/staff/inbox` shows the customer's claim
  - open the claim → reply → the reply shows up in the customer portal thread
  - upload a file → it appears in the customer's Documents tab

- [ ] **Step 6:** Verify RLS by trying to read `customer_messages` from a different customer's session. Expected: zero rows (RLS enforces).

- [ ] **Step 7:** If everything passes, final commit:

```bash
git commit --allow-empty -m "verify(modernappraisers): v1 end-to-end smoke passing"
```

---

## Prerequisites (reminders)

Before Phase 4+ can run end-to-end, the user must:
1. Create a **Resend** account; generate an API key; put it in `modernappraisers/.env.local` as `RESEND_API_KEY`.
2. Configure **Supabase phone auth** (dashboard → Auth → Phone → provider = Twilio); create or link a Twilio account for SMS.
3. Run `supabase/migration-modernappraisers.sql` in the Supabase SQL editor (before Task 3.2 is useful).

Phases 0–3 (scaffold, UI primitives, marketing pages, DB migration) can all be built WITHOUT any of these in place. Phase 4+ needs them.

## Explicitly out of scope for V1

- Blog
- Automated status-change SMS notifications (customer gets email only in V1)
- Spanish or other translations
- Analytics / tag manager
- Admin-side "customer submission" badges or filters in HAMS (per user: no HAMS UI changes)
- Deploy / DNS cutover (user said "build locally first")
