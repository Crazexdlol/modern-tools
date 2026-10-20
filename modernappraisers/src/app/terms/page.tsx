import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Modern Appraisers',
  description: 'The terms governing your use of modernappraisers.com and the services provided by Modern Appraisers, a service of Modern Group LLC.',
}

// Effective date is the day this document was first published. Update it
// whenever a material change is made so the "last updated" badge is honest.
const EFFECTIVE_DATE = 'October 18, 2026'

export default function TermsPage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-10 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">Legal</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.05]">
              Terms of Service
            </h1>
            <p className="mt-6 text-sm uppercase tracking-wider text-[color:var(--color-ink-soft)]">
              Last updated: {EFFECTIVE_DATE}
            </p>
            <p className="mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)]">
              Please read these Terms carefully before using modernappraisers.com or engaging Modern Appraisers for services. By using this site or requesting services, you agree to be bound by these Terms. If you do not agree, do not use the site.
            </p>
          </div>
        </Container>
      </section>

      {/* Body */}
      <section className="py-14 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl space-y-10 text-[color:var(--color-ink-muted)] leading-relaxed">

            <Clause num="1" title="Agreement to Terms">
              <p>These Terms of Service (&quot;Terms&quot;) form a binding agreement between you (&quot;you,&quot; &quot;your,&quot; or &quot;Client&quot;) and Modern Appraisers, a service of Modern Group LLC (&quot;Modern Appraisers,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), governing your access to and use of modernappraisers.com (the &quot;Site&quot;) and any related services, forms, content, or communications offered through the Site (collectively, the &quot;Services&quot;). By accessing the Site, submitting a claim or inquiry, or otherwise engaging with us, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.</p>
            </Clause>

            <Clause num="2" title="Who We Are">
              <p>Modern Appraisers is an independent third-party vehicle appraisal firm. We provide documented, defensible vehicle valuations and dispute-resolution support to vehicle owners, carriers, attorneys, adjusters, fleet operators, and other parties involved in auto claims. Our Services include Actual Cash Value (ACV) appraisals, Diminished Value (DV) appraisals, Cost of Repair appraisals, Loss of Use calculations, Storage charge disputes, Umpire services, Desk and Subrogation reviews, and other related professional work. Modern Appraisers is backed by over 27 years of combined independent appraisal experience.</p>
              <p>Our principal place of business is in Clark County, Nevada. You may contact us at (702) 321-5930 or info@modernappraisers.com.</p>
            </Clause>

            <Clause num="3" title="Not Legal Advice; Not Insurance">
              <p>Modern Appraisers is not a law firm, and nothing on the Site or in any communication with us constitutes legal advice. Our Services are limited to professional vehicle appraisal and related dispute-resolution support. We are not an insurance company, insurance adjuster, insurance agent, or broker. We do not sell insurance, bind coverage, adjust claims on behalf of a carrier, or make coverage determinations. Information on the Site, including the FAQ, educational content, and references to state laws or regulations, is provided for general informational purposes only; laws and regulations change and vary by jurisdiction. You should consult a licensed attorney in your jurisdiction for legal advice specific to your situation and should not rely on Site content as a substitute for professional legal counsel.</p>
            </Clause>

            <Clause num="4" title="Eligibility">
              <p>You must be at least eighteen (18) years old and legally capable of forming a binding contract under the laws of your jurisdiction to use the Site or request Services. If you are acting on behalf of a company, carrier, law firm, or other entity, you represent and warrant that you have authority to bind that entity to these Terms. The Site is directed to users located within the United States. If you access the Site from outside the United States, you do so at your own risk and are responsible for compliance with your local laws.</p>
            </Clause>

            <Clause num="5" title="Website Use and Acceptable Conduct">
              <p>You agree to use the Site only for lawful purposes and in accordance with these Terms. You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Use the Site in any manner that could disable, overburden, damage, or impair the Site or interfere with any other party&apos;s use of the Site;</li>
                <li>Use any robot, spider, scraper, or other automated means to access the Site or collect data without our prior written consent;</li>
                <li>Introduce any virus, trojan, worm, logic bomb, or other malicious or technologically harmful material;</li>
                <li>Attempt to gain unauthorized access to, interfere with, damage, or disrupt any parts of the Site, the server on which it is stored, or any server, computer, or database connected to the Site;</li>
                <li>Impersonate any person, misrepresent your affiliation, or submit false or misleading information through any form or communication channel;</li>
                <li>Harvest, scrape, or otherwise reproduce the FAQ, articles, forms, or other content for commercial purposes without written permission;</li>
                <li>Use the Site in a way that violates any applicable federal, state, or local law or regulation.</li>
              </ul>
              <p className="mt-3">We reserve the right to investigate suspected violations and, where appropriate, suspend or terminate your access to the Site.</p>
            </Clause>

            <Clause num="6" title="User Submissions">
              <p>When you submit information to us through a contact form, a submit-a-claim form, email, phone, text message, or any other channel (collectively, &quot;Submissions&quot;), you represent that the information is truthful, accurate, and complete, and that you have the right to share it. Do not transmit Social Security numbers, bank account numbers, protected health information, or other sensitive information through unsecured channels; use secure channels we designate in writing for sensitive materials. We may use Submissions to evaluate your inquiry, communicate with you, prepare a scope of work, and, if we accept the engagement, perform the Services. We treat Submissions in accordance with our Privacy Policy.</p>
              <p>A Submission does not, by itself, create an engagement with Modern Appraisers. We are not retained to perform Services until the parties have executed a separate written engagement letter or similar agreement describing the scope of work and the applicable fees.</p>
            </Clause>

            <Clause num="7" title="Formation of a Service Engagement">
              <p>Any professional engagement for appraisal or related Services is governed by a separate written engagement letter, assignment, or service agreement between you and Modern Appraisers (an &quot;Engagement Letter&quot;). The Engagement Letter sets out the scope of work, deliverables, timeline, fees, payment terms, and other material terms. In the event of a conflict between these Terms and an Engagement Letter, the Engagement Letter controls as to the subject matter of that engagement, while these Terms otherwise continue to govern your use of the Site.</p>
            </Clause>

            <Clause num="8" title="Independent Appraiser Role">
              <p>When retained to perform an appraisal, Modern Appraisers acts as an independent appraiser bound by professional standards of competence, honesty, and documentation. Our opinions of value are based on our analysis of the vehicle, comparable market data, documentation produced, and other relevant evidence. We are not an advocate for any party and will not inflate, deflate, or shape an opinion to meet a desired outcome. If retained by a client under the appraisal clause of an insurance policy, we serve as that client&apos;s designated appraiser, but our professional obligations to produce a defensible, well-documented opinion do not change.</p>
              <p>If retained as an umpire, Modern Appraisers serves as a neutral third party to resolve differences between two party-appointed appraisers. In that role we owe no advocacy duty to either side; our obligation is to decide the dispute based on the evidence and the policy terms.</p>
            </Clause>

            <Clause num="9" title="No Guarantee of Outcome">
              <p>We do not guarantee any specific result, settlement amount, award, or outcome. The appraisal process, insurance claims handling, and dispute resolution involve multiple parties, independent decision makers (including umpires, arbitrators, and courts), and factual and legal considerations outside our control. Testimonials, case studies, and statistics on the Site reflect past results in individual circumstances and are not a prediction or guarantee of future results. Nothing on the Site should be interpreted as a promise of a particular recovery, settlement, or decision in your matter.</p>
            </Clause>

            <Clause num="10" title="Client Responsibilities">
              <p>You agree to cooperate with Modern Appraisers in performing the Services, including by:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Providing accurate and complete information about the vehicle, the loss, the policy, and the parties;</li>
                <li>Producing requested documentation (title, registration, maintenance records, photos, estimates, policy declarations, prior appraisals, correspondence) in a timely manner;</li>
                <li>Making the vehicle available for inspection where applicable;</li>
                <li>Responding promptly to our communications and requests;</li>
                <li>Paying fees owed under the Engagement Letter when due.</li>
              </ul>
              <p className="mt-3">Our opinions and work product are only as reliable as the information you provide. We are entitled to rely on your Submissions and documentation and are not responsible for errors, omissions, or outcomes resulting from inaccurate or incomplete information.</p>
            </Clause>

            <Clause num="11" title="Fees and Payment">
              <p>Fees for Services are set forth in your Engagement Letter. Unless the Engagement Letter provides otherwise, fees are earned when the Services are performed and are due on invoice. Any retainer or deposit is non-refundable except to the extent required by law or stated in the Engagement Letter. Overdue invoices may accrue interest at the lesser of 1.5% per month or the maximum rate permitted by applicable law, and you agree to reimburse us for reasonable costs of collection, including attorneys&apos; fees, where permitted. The Site itself does not display pricing because fees vary with scope, vehicle class, and jurisdiction.</p>
            </Clause>

            <Clause num="12" title="Communications and Consent">
              <p>By providing a phone number, email address, or other contact information to us (whether through the Site, email, text message, or verbally), you consent to be contacted by Modern Appraisers at that number or address, including by phone call, email, text message (SMS/MMS), and voicemail, in connection with your inquiry, your engagement, and the Services. You consent that communications may be made using automated or prerecorded means where permitted by law. Consent to receive marketing communications is not a condition of using the Services. Standard carrier message and data rates may apply to text communications. You may opt out of marketing text messages at any time by replying STOP; transactional messages related to an active engagement may continue so we can perform the Services. You may unsubscribe from marketing emails using the link in those emails or by contacting us. If any communication is required in writing under these Terms, email to info@modernappraisers.com will satisfy that requirement unless we specify otherwise.</p>
            </Clause>

            <Clause num="13" title="Confidentiality">
              <p>We will treat non-public information you provide to us in connection with an engagement as confidential and will use it only to perform the Services and as required by law. We may share information with our personnel, contractors, and professional advisors who need it to perform the Services, each of whom is bound by comparable confidentiality obligations. We may disclose information where required by subpoena, court order, regulatory authority, or applicable law. Nothing in this section limits our ability to describe engagements in general, non-identifying terms for marketing, case studies, or quality purposes.</p>
            </Clause>

            <Clause num="14" title="Intellectual Property">
              <p>All content on the Site, including text, graphics, logos, icons, images, FAQ content, data compilations, and software, is the property of Modern Appraisers, Modern Group LLC, or our licensors and is protected by United States and international copyright, trademark, and other intellectual property laws. We grant you a limited, revocable, non-exclusive, non-transferable license to access and view the Site for your personal, non-commercial use. No other use is permitted without our prior written consent.</p>
              <p>Reports, appraisals, estimates, and other deliverables we produce under an Engagement Letter are prepared for the use of the engaging client in connection with the specific matter described in the Engagement Letter. Unless otherwise stated in the Engagement Letter, the client receives a non-transferable license to use the deliverable for that purpose; Modern Appraisers retains all underlying intellectual property rights, including the right to use our methodology, templates, and know-how in other engagements.</p>
            </Clause>

            <Clause num="15" title="Third-Party Links and Content">
              <p>The Site may contain links to third-party websites, services, or resources (including state Department of Insurance pages, carrier portals, and industry references). These links are provided for convenience only. We do not control third-party sites or services and are not responsible for their content, accuracy, privacy practices, or availability. Access to third-party sites is at your own risk and is subject to the terms of those sites.</p>
            </Clause>

            <Clause num="16" title="Accuracy of Site Content">
              <p>We strive to keep the Site accurate and current, but we make no representation or warranty that any content, including the FAQ, service descriptions, or state-law references, is complete, current, or free from error. Site content is provided &quot;as is&quot; and may be updated or removed at any time without notice. Laws, regulations, and insurance industry practices vary by jurisdiction and change over time; do not rely on Site content as a substitute for the current law in your jurisdiction or legal advice from a licensed attorney.</p>
            </Clause>

            <Clause num="17" title="Privacy">
              <p>Our Privacy Policy describes how we collect, use, share, and protect personal information submitted through the Site or in the course of an engagement. By using the Site or the Services you also agree to our Privacy Policy, which is incorporated into these Terms by reference.</p>
            </Clause>

            <Clause num="18" title="Disclaimer of Warranties">
              <p>THE SITE AND ALL CONTENT AND SERVICES OFFERED THROUGH THE SITE ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, MODERN APPRAISERS AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AGENTS, CONTRACTORS, AND LICENSORS DISCLAIM ALL WARRANTIES, INCLUDING WITHOUT LIMITATION IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT ANY DEFECTS WILL BE CORRECTED.</p>
              <p>Nothing in this section limits the professional standard of care applicable to Services performed under a written Engagement Letter; appraisal services are performed with the care, skill, and diligence ordinarily exercised by qualified independent vehicle appraisers.</p>
            </Clause>

            <Clause num="19" title="Limitation of Liability">
              <p>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL MODERN APPRAISERS, MODERN GROUP LLC, OR ANY OF OUR AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR CONTRACTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, LOSS OF REVENUE, LOSS OF USE, LOSS OF GOODWILL, LOSS OF DATA, OR BUSINESS INTERRUPTION, ARISING OUT OF OR IN CONNECTION WITH THE SITE, THE SERVICES, OR THESE TERMS, WHETHER BASED ON CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, OR ANY OTHER LEGAL THEORY, AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
              <p>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SITE OR THE SERVICES WILL NOT EXCEED THE GREATER OF (A) THE FEES ACTUALLY PAID BY YOU TO MODERN APPRAISERS FOR THE SPECIFIC ENGAGEMENT GIVING RISE TO THE CLAIM IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE THOUSAND DOLLARS ($1,000). THE PARTIES ACKNOWLEDGE THAT THIS ALLOCATION OF RISK IS A MATERIAL PART OF THESE TERMS AND IS REFLECTED IN THE FEES CHARGED.</p>
              <p>Some jurisdictions do not allow the exclusion or limitation of certain damages. In those jurisdictions our liability will be limited to the fullest extent permitted by law. Nothing in these Terms limits liability that cannot be excluded or limited under applicable law.</p>
            </Clause>

            <Clause num="20" title="Indemnification">
              <p>You agree to defend, indemnify, and hold harmless Modern Appraisers, Modern Group LLC, and our affiliates, officers, directors, employees, agents, and contractors from and against any claims, liabilities, damages, judgments, awards, losses, costs, and expenses (including reasonable attorneys&apos; fees) arising out of or relating to (a) your breach of these Terms or any Engagement Letter; (b) your use or misuse of the Site or the Services; (c) your Submissions, including any inaccuracy, misrepresentation, or omission; (d) your violation of any applicable law or any third-party right; or (e) any dispute between you and a third party. We reserve the right, at our own expense, to assume the exclusive defense and control of any matter otherwise subject to indemnification by you, in which case you will reasonably cooperate.</p>
            </Clause>

            <Clause num="21" title="Dispute Resolution; Binding Arbitration; Class-Action Waiver">
              <p><strong>Please read this section carefully. It affects your legal rights.</strong></p>
              <p><em>Informal resolution.</em> Before filing a claim, you agree to first contact us in writing at info@modernappraisers.com with a brief description of the dispute and your contact information. The parties will attempt in good faith to resolve the dispute informally for at least thirty (30) days before pursuing arbitration or litigation.</p>
              <p><em>Binding arbitration.</em> Any dispute, claim, or controversy arising out of or relating to these Terms, the Site, or the Services (a &quot;Dispute&quot;) that is not resolved informally will be resolved exclusively by final and binding individual arbitration administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules (or, for business-to-business disputes, the Commercial Arbitration Rules). The arbitration will be conducted by a single arbitrator. The seat of arbitration will be Clark County, Nevada, and the arbitration will be conducted in English. The arbitrator may award any relief that a court could award, except as limited by these Terms. Judgment on the award may be entered in any court of competent jurisdiction.</p>
              <p><em>Class-action waiver.</em> YOU AND MODERN APPRAISERS AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING. The arbitrator may not consolidate more than one person&apos;s claims and may not preside over any form of a representative or class proceeding. If this class-action waiver is held unenforceable as to any part of a Dispute, that part will be severed and litigated in court; the balance of this section remains in force.</p>
              <p><em>Exceptions.</em> Nothing in this section prevents either party from (a) seeking individual relief in a small-claims court for claims within that court&apos;s jurisdiction, or (b) seeking injunctive or equitable relief in a court of competent jurisdiction to protect intellectual property, confidential information, or to prevent irreparable harm.</p>
              <p><em>30-day opt-out.</em> You may opt out of this arbitration provision by sending written notice to info@modernappraisers.com within thirty (30) days of first accepting these Terms. The notice must include your name, address, email used, and a clear statement that you are opting out of arbitration under modernappraisers.com Terms of Service. If you opt out, Disputes will be resolved in court under the venue and governing law provisions below.</p>
            </Clause>

            <Clause num="22" title="Governing Law and Venue">
              <p>These Terms, your use of the Site, and the Services are governed by the laws of the State of Nevada, without regard to its conflict-of-laws principles. Subject to the arbitration provision above, you and Modern Appraisers irrevocably submit to the exclusive jurisdiction of the state and federal courts located in Clark County, Nevada, for any action or proceeding not subject to arbitration, and waive any objection to venue in those courts.</p>
            </Clause>

            <Clause num="23" title="Changes to These Terms">
              <p>We may update these Terms from time to time. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. Material changes will be announced on the Site or communicated to you directly. Your continued use of the Site or the Services after the effective date of a revised version of the Terms constitutes your acceptance of the revised Terms. If you do not agree to the revised Terms, you must stop using the Site and the Services.</p>
            </Clause>

            <Clause num="24" title="Termination">
              <p>We may suspend or terminate your access to the Site at any time, with or without notice, if we believe you have violated these Terms, abused the Services, or if required by law. You may stop using the Site at any time. Termination does not affect any rights, obligations, or liabilities that accrued before termination, and the following sections survive termination: 3, 7 through 11, 13 through 24, and 25.</p>
            </Clause>

            <Clause num="25" title="Miscellaneous">
              <p><em>Entire agreement.</em> These Terms, together with any Engagement Letter and our Privacy Policy, constitute the entire agreement between you and Modern Appraisers regarding the Site and the Services, and supersede any prior or contemporaneous agreements, communications, or understandings, written or oral, regarding that subject matter.</p>
              <p><em>Severability.</em> If any provision of these Terms is held invalid, illegal, or unenforceable, that provision will be enforced to the maximum extent permissible, and the remaining provisions will remain in full force and effect.</p>
              <p><em>No waiver.</em> Our failure to enforce any provision of these Terms is not a waiver of that provision or any other provision. A waiver is only effective if made in writing and signed by an authorized representative of Modern Appraisers.</p>
              <p><em>Assignment.</em> You may not assign or transfer these Terms, by operation of law or otherwise, without our prior written consent. We may assign these Terms freely, including in connection with a merger, acquisition, reorganization, or sale of assets. Any attempted assignment in violation of this section is void.</p>
              <p><em>Relationship of the parties.</em> Nothing in these Terms creates any agency, partnership, joint venture, or employment relationship between the parties. Modern Appraisers performs the Services as an independent contractor.</p>
              <p><em>Force majeure.</em> We will not be liable for any failure or delay in performance caused by circumstances beyond our reasonable control, including acts of God, natural disasters, pandemic, war, terrorism, riot, civil unrest, government action, labor disputes, utility failures, or Internet or communications outages.</p>
              <p><em>Headings.</em> Section headings are for convenience only and have no legal effect.</p>
              <p><em>Interpretation.</em> The word &quot;including&quot; means &quot;including without limitation.&quot; Singular terms include the plural and vice versa. These Terms will not be interpreted against the drafter.</p>
              <p><em>Notices.</em> Notices to Modern Appraisers must be sent to info@modernappraisers.com. We may send notices to you by email, by posting on the Site, or by any other reasonable means.</p>
            </Clause>

            <Clause num="26" title="Contact">
              <p>If you have questions about these Terms or need to contact us for any reason described above, reach us at:</p>
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

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">Have questions?</h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              If anything above is unclear, reach out and we&apos;ll walk you through it before you engage us.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/contact" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Contact Us</Link>
              <a href="tel:+17023215930" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Call (702) 321-5930</a>
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
