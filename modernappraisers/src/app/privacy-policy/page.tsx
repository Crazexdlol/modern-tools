import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Modern Appraisers',
  description: 'How Modern Appraisers collects, uses, shares, and protects personal information submitted through modernappraisers.com and in the course of a service engagement.',
}

const EFFECTIVE_DATE = 'October 18, 2026'

export default function PrivacyPolicyPage() {
  return (
    <main>
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-10 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Legal</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Privacy Policy
            </h1>
            <p className="mt-6 text-sm uppercase tracking-wider text-[color:var(--color-ink-soft)]">
              Last updated: {EFFECTIVE_DATE}
            </p>
            <p className="mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              This Privacy Policy explains how Modern Appraisers, a service of Modern Group LLC (&quot;Modern Appraisers,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), collects, uses, shares, and protects personal information in connection with modernappraisers.com (the &quot;Site&quot;) and the professional services we provide (the &quot;Services&quot;). By using the Site or requesting Services, you agree to the practices described below.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl space-y-10 text-[color:var(--color-ink-muted)] leading-relaxed">

            <Clause num="1" title="Scope of This Policy">
              <p>This Policy applies to information we collect from and about users of the Site and clients, prospective clients, counterparties, and other individuals who interact with us in the course of an engagement. It does not apply to information handled by third parties we do not control, including carriers, body shops, state agencies, courts, or independent counsel, each of which has its own privacy practices.</p>
            </Clause>

            <Clause num="2" title="Information You Provide to Us">
              <p>We collect information you provide directly, including:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Contact information</strong> you enter in a Site form or share with us by email, phone, or text: name, company or carrier, email address, phone number, and the message you send;</li>
                <li><strong>Claim and vehicle information</strong>: details about the vehicle (year, make, model, VIN, mileage, condition), the loss (date, cause, parties, estimates), the policy (carrier, policy and claim numbers, coverages), and any documentation you supply (photos, titles, repair estimates, prior appraisals, correspondence);</li>
                <li><strong>Payment information</strong> for engaged work, which is processed through third-party payment processors and not stored on our servers;</li>
                <li><strong>Any additional information</strong> you choose to share with us in connection with your inquiry or engagement.</li>
              </ul>
              <p className="mt-3">Please do not submit Social Security numbers, financial-account numbers, protected health information, or other particularly sensitive information through unsecured channels. If sensitive information is required for an engagement, we will provide a secure channel for its transmission.</p>
            </Clause>

            <Clause num="3" title="Information We Collect Automatically">
              <p>When you visit the Site, we and our service providers may automatically collect certain technical information, including IP address, browser type and version, device and operating system, referring and exit URLs, pages viewed, timestamps, and interaction data. We use cookies, pixels, and similar technologies for site functionality, analytics, and security. You can control cookies through your browser settings; disabling cookies may affect Site functionality.</p>
            </Clause>

            <Clause num="4" title="Information From Third Parties">
              <p>In the course of performing Services we may receive information about you or about a vehicle, policy, or claim from third parties, including carriers, adjusters, body shops, tow yards, state Departments of Motor Vehicles, vehicle history providers, auction and market-data providers, and public records. We handle that information in accordance with this Policy and any applicable confidentiality or regulatory obligations.</p>
            </Clause>

            <Clause num="5" title="How We Use Information">
              <p>We use information to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Respond to inquiries and prepare proposals or scopes of work;</li>
                <li>Provide, document, and deliver the Services;</li>
                <li>Communicate with you about your inquiry, engagement, invoices, and related matters, including by phone call, email, text message, and voicemail;</li>
                <li>Improve the Site, our Services, and our internal processes;</li>
                <li>Prevent fraud, enforce our Terms of Service, protect the Site, and defend legal claims;</li>
                <li>Comply with applicable law, subpoenas, court orders, and regulatory requirements.</li>
              </ul>
            </Clause>

            <Clause num="6" title="Legal Bases and Marketing">
              <p>We rely on the following legal bases, as applicable: your consent (where required), the performance of a contract with you, our legitimate business interests (such as providing Services, improving the Site, and preventing fraud), and compliance with legal obligations. If you have opted in, we may send occasional marketing emails about our Services. You can opt out at any time using the unsubscribe link in those emails or by contacting us. Opting out of marketing does not stop transactional communications tied to an active engagement.</p>
            </Clause>

            <Clause num="7" title="How We Share Information">
              <p>We do not sell personal information. We share information in these limited circumstances:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Service providers.</strong> With vendors and contractors who help us operate the Site and deliver Services, including hosting, email, analytics, document storage, payment processing, and secure communications. Each is bound by contractual obligations to use the information only for our purposes and to protect it appropriately.</li>
                <li><strong>Engagement counterparties.</strong> With carriers, adjusters, opposing appraisers, umpires, attorneys, body shops, courts, or other parties as reasonably necessary to perform the Services you engaged us for.</li>
                <li><strong>Legal and safety.</strong> When required by subpoena, court order, regulator, or applicable law; to enforce our Terms of Service; to protect our rights, property, or safety or those of our clients or others; or to investigate suspected fraud or wrongdoing.</li>
                <li><strong>Business transfers.</strong> In connection with a merger, acquisition, financing, reorganization, bankruptcy, or sale of all or part of our business, in which case we will take reasonable steps to require the recipient to honor this Policy.</li>
                <li><strong>With your direction.</strong> At your direction or with your consent.</li>
              </ul>
            </Clause>

            <Clause num="8" title="Cookies and Analytics">
              <p>We use cookies and similar technologies to recognize returning visitors, remember preferences, measure traffic, and improve the Site. Our analytics providers may collect aggregated usage information that does not identify individual users. You can block or delete cookies in your browser settings; some Site features may not function correctly without cookies. We do not currently respond to browser Do-Not-Track signals; where state law provides equivalent opt-out mechanisms, we honor those.</p>
            </Clause>

            <Clause num="9" title="Data Retention">
              <p>We retain information for as long as needed to provide the Services, maintain client records, comply with legal obligations (including statutes of limitation, professional-liability retention, and tax recordkeeping), resolve disputes, and enforce our agreements. Engagement files are typically retained for at least seven (7) years after the engagement closes, after which we may delete, anonymize, or archive them. Specific retention periods vary by jurisdiction and record type.</p>
            </Clause>

            <Clause num="10" title="Information Security">
              <p>We use reasonable administrative, technical, and physical safeguards designed to protect personal information against unauthorized access, use, disclosure, alteration, and destruction. No system is impenetrable, however, and we cannot guarantee the absolute security of any information you transmit to us. You are responsible for keeping your account credentials and devices secure and for choosing secure channels when sending sensitive information.</p>
            </Clause>

            <Clause num="11" title="Your Privacy Rights">
              <p>Depending on your state of residence, you may have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Request access to the personal information we hold about you;</li>
                <li>Request correction of inaccurate information;</li>
                <li>Request deletion of personal information, subject to legal and recordkeeping exceptions;</li>
                <li>Opt out of certain sharing or targeted advertising practices (we do not currently engage in cross-context behavioral advertising or sell personal information as those terms are defined under applicable state laws);</li>
                <li>Appeal a decision we make about your request;</li>
                <li>Receive this notice in an accessible format.</li>
              </ul>
              <p className="mt-3">California residents have specific rights under the California Consumer Privacy Act and the California Privacy Rights Act (collectively, the &quot;CCPA&quot;), including the right to know what categories of personal information we have collected, used, and disclosed; the right to request deletion; the right to correct inaccurate information; the right to opt out of the sale or sharing of personal information; and the right to non-discrimination for exercising these rights. We do not sell personal information. To exercise any of these rights, email us at info@modernappraisers.com. We may need to verify your identity before responding. You may also designate an authorized agent to submit a request on your behalf; we may require proof of authorization.</p>
              <p>Residents of Virginia, Colorado, Connecticut, Utah, Texas, and other states with comprehensive consumer-privacy laws have similar rights, which we honor to the extent required by law.</p>
            </Clause>

            <Clause num="12" title="Children&apos;s Privacy">
              <p>The Site and the Services are not directed to children under the age of eighteen (18), and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information to us, please contact us and we will delete it promptly.</p>
            </Clause>

            <Clause num="13" title="International Users">
              <p>The Site is operated from the United States and the Services are provided within the United States. If you access the Site from outside the United States, you understand that your information will be transferred to, processed, and stored in the United States, which may have different data-protection laws from your country. By using the Site you consent to that transfer and processing.</p>
            </Clause>

            <Clause num="14" title="Third-Party Links">
              <p>The Site may contain links to third-party websites or services, including state Department of Insurance pages, carrier portals, and industry references. We are not responsible for the privacy practices of those third parties. Please review their privacy policies before providing any information.</p>
            </Clause>

            <Clause num="15" title="Changes to This Policy">
              <p>We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. Material changes will be announced on the Site or communicated to you directly. Your continued use of the Site or the Services after the effective date of a revised Policy constitutes your acceptance of the updated Policy.</p>
            </Clause>

            <Clause num="16" title="Contact Us">
              <p>If you have questions about this Policy or wish to exercise any of your rights, contact us at:</p>
              <div className="mt-4 text-[color:var(--color-ink)] not-italic">
                <div className="font-semibold">Modern Appraisers</div>
                <div>a service of Modern Group LLC</div>
                <div className="mt-2">Clark County, Nevada, United States</div>
                <div className="mt-2">
                  <a href="tel:+17023215930" className="text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">(702) 321-5930</a>
                </div>
                <div>
                  <a href="mailto:info@modernappraisers.com" className="text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-ink)]">info@modernappraisers.com</a>
                </div>
              </div>
            </Clause>

          </div>
        </Container>
      </section>

      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Questions about your data?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Reach out and we&apos;ll walk you through what we hold and what we do with it.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/contact" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Contact Us</Link>
              <Link href="/terms" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}

function Clause({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`clause-${num}`} className="scroll-mt-24">
      <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[color:var(--color-ink)]">
        <span className="text-[color:var(--color-accent)] mr-3 tabular-nums">{num}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base">
        {children}
      </div>
    </section>
  )
}
