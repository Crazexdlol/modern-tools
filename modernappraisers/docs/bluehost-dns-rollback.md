# Bluehost DNS rollback — modernappraisers.com

Record of the DNS cutover from Bluehost hosting to Vercel on **2026-10-19**.
If the Vercel site breaks and you need to send modernappraisers.com back to
the Bluehost WordPress site, revert the two records below in Bluehost's
Advanced DNS Records editor.

## What was changed

Only two records were modified. Everything else (`MX`, `TXT`, `cpanel`, `ftp`,
`imap`, `pop`, `smtp`, `webmail`, `autoconfig.*`, all other subdomains, the
Bluehost nameservers themselves) was **left untouched** so email and all
other Bluehost services continue working.

| Type | Host | Old value (Bluehost) | New value (Vercel) | TTL |
|------|------|----------------------|--------------------|-----|
| `A`     | `@`   | `162.241.225.231` (hosting)       | `216.198.79.1`                           | 4 Hours |
| `CNAME` | `www` | `modernappraisers.com` (hosting)  | `bb2a44fd62bd1cc3.vercel-dns-017.com.`   | 4 Hours |

> **Note on Vercel values**: Vercel's legacy records `76.76.21.21` (apex) and
> `cname.vercel-dns.com` (www) also route to Vercel, but as of 2026-10-19
> Vercel is expanding its IP range and new apex-domain SSL certificate
> issuance requires the newer values above. If Vercel ever surfaces another
> "DNS Change Recommended" badge in the future, update to whatever Vercel
> shows in the Domains dashboard; the legacy records will continue to work
> but may block new cert issuance.

Nameservers stayed as `ns1.bluehost.com` / `ns2.bluehost.com`. We did NOT
switch to Vercel nameservers — that would have broken email.

## How to roll back

1. Log into Bluehost → **Domains** → `modernappraisers.com` → **Advanced DNS**.
2. Find the `A` record for host `@` → three-dot menu → **Edit** → change
   **Point To** back to `162.241.225.231` → **Save**.
3. Find the `CNAME` record for host `www` → three-dot menu → **Edit** → change
   **Point To** back to `modernappraisers.com` (yes, pointing at itself —
   that's how Bluehost sets up `www` by default) → **Save**.
4. Propagation back to Bluehost: minutes to a few hours typically. Clear your
   browser cache / try an incognito window if you still see the Vercel site.

The old Bluehost WordPress site was never deleted — it continues to live on
Bluehost's servers. Reverting the DNS re-exposes it instantly. You also have
local backups downloaded on 2026-10-19:
- `File Backups` zip (WordPress files)
- `Database Backups` SQL dump

## Vercel side (for context)

- Vercel project: `modernappraisers` under scope `henry-as-projects-88caed67`
- Both `modernappraisers.com` + `www.modernappraisers.com` are attached to
  that project
- SSL cert auto-provisioned by Vercel via Let's Encrypt — nothing to configure
- Rollback target for the Vercel deployment itself (separate from DNS):
  check `vercel inspect modernappraisers.vercel.app --scope henry-as-projects-88caed67`

## Verifying DNS state at any point

```
nslookup modernappraisers.com 1.1.1.1
nslookup www.modernappraisers.com 1.1.1.1
```

Expected (Vercel): apex returns `76.76.21.21`; `www` resolves via
`cname.vercel-dns.com` to a Vercel IP.

Expected (after rollback): apex returns `162.241.225.231`; `www` returns the
same (via the self-referential CNAME).

Also useful: https://dnschecker.org/#A/modernappraisers.com shows propagation
across global resolvers.
