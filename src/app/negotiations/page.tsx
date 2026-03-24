"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  Loader2,
  AlertCircle,
  Mail,
  Files,
  Shield,
  Target,
  Lightbulb,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCEPT_ALL = {
  "application/pdf": [".pdf"],
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "text/plain": [".txt"],
};

function FileDropzone({
  files,
  onDrop,
  onRemove,
  label,
  hint,
  multiple,
}: {
  files: File[];
  onDrop: (f: File[]) => void;
  onRemove: (i: number) => void;
  label: string;
  hint: string;
  multiple?: boolean;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT_ALL,
    multiple: multiple ?? true,
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-orange-400 bg-orange-50"
            : "border-gray-300 hover:border-gray-400 bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-6 h-6 mx-auto mb-1.5 text-gray-400" />
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-700 truncate flex-1">
                {file.name}
              </span>
              <span className="text-xs text-gray-400">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NegotiationsPage() {
  const [emailText, setEmailText] = useState("");
  const [context, setContext] = useState("");
  const [chainFiles, setChainFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      "overview",
      "iaWeaknesses",
      "ourWeaknesses",
      "response",
      "emailAnalysis",
      "documentCritique",
      "strategy",
    ])
  );

  // Load last result from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("modern-tools-negotiations");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.result) setResult(parsed.result);
        if (parsed.context) setContext(parsed.context);
        if (parsed.emailText) setEmailText(parsed.emailText);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save result to localStorage whenever it changes
  useEffect(() => {
    if (result) {
      localStorage.setItem(
        "modern-tools-negotiations",
        JSON.stringify({ result, context, emailText })
      );
    }
  }, [result, context, emailText]);

  const onDropChain = useCallback((accepted: File[]) => {
    setChainFiles((prev) => [...prev, ...accepted]);
  }, []);

  const onDropDocs = useCallback((accepted: File[]) => {
    setDocFiles((prev) => [...prev, ...accepted]);
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const hasAnyInput =
    emailText.trim() || chainFiles.length > 0 || docFiles.length > 0;

  const handleAnalyze = async () => {
    if (!hasAnyInput) {
      setError("Provide at least one input — paste text, upload an email chain, or upload documents.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      if (context.trim()) formData.append("context", context);
      if (emailText.trim()) formData.append("emailText", emailText);
      chainFiles.forEach((f) => formData.append("emailChain", f));
      docFiles.forEach((f) => formData.append("documents", f));

      const res = await fetch("/api/negotiations/analyze", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server error (${res.status}) — please try again`);
      }

      if (data.error) throw new Error(data.error);
      if (!data.result) throw new Error("No result received");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setEmailText("");
    setContext("");
    localStorage.removeItem("modern-tools-negotiations");
    setChainFiles([]);
    setDocFiles([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Modern Appraisers"
              width={160}
              height={48}
              className="h-9 w-auto"
              priority
            />
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-white transition-colors">Negotiations</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Negotiations</h1>
            <p className="text-sm text-gray-500">
              Paste emails, upload chains & documents — get a full negotiation strategy
            </p>
          </div>
        </div>

        {!result ? (
          /* ─── INPUT VIEW ─── */
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Context */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">
                  Claim Context
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Vehicle info, your appraised value, their offer, what's being disputed, claim number, etc."
                  className="w-full min-h-[70px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y placeholder:text-gray-400"
                />
              </CardContent>
            </Card>

            {/* Three input sections side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 1 — Paste Email / Text */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-orange-600" />
                    <CardTitle className="text-sm font-medium text-gray-700">
                      Paste Text
                    </CardTitle>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Paste an email from the IA, notes, or any relevant text
                  </p>
                </CardHeader>
                <CardContent className="flex-1">
                  <textarea
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                    placeholder="Paste the IA's email or any text here..."
                    className="w-full h-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y placeholder:text-gray-400"
                  />
                </CardContent>
              </Card>

              {/* 2 — Email Chain Upload */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Files className="w-4 h-4 text-orange-600" />
                    <CardTitle className="text-sm font-medium text-gray-700">
                      Email Chain
                    </CardTitle>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Upload the full email thread as PDF or image
                  </p>
                </CardHeader>
                <CardContent className="flex-1">
                  <FileDropzone
                    files={chainFiles}
                    onDrop={onDropChain}
                    onRemove={(i) =>
                      setChainFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    label="Drop email chain here"
                    hint="PDF, PNG, JPG, TXT"
                  />
                </CardContent>
              </Card>

              {/* 3 — Claim Documents */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-600" />
                    <CardTitle className="text-sm font-medium text-gray-700">
                      Claim Documents
                    </CardTitle>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Upload invoices, comps, ACV reports, estimates, etc.
                  </p>
                </CardHeader>
                <CardContent className="flex-1">
                  <FileDropzone
                    files={docFiles}
                    onDrop={onDropDocs}
                    onRemove={(i) =>
                      setDocFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    label="Drop documents here"
                    hint="PDF, PNG, JPG, TXT — multiple files OK"
                    multiple
                  />
                </CardContent>
              </Card>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Analyze Button */}
            <Button
              onClick={handleAnalyze}
              disabled={loading || !hasAnyInput}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white h-12 text-base font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Target className="w-5 h-5 mr-2" />
                  Analyze & Strategize
                </>
              )}
            </Button>
          </div>
        ) : (
          /* ─── RESULTS VIEW ─── */
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold">Negotiation Strategy</h2>
              </div>
              <Button variant="outline" onClick={handleReset}>
                <ArrowLeft className="w-4 h-4 mr-1" /> New Analysis
              </Button>
            </div>

            {/* Overview */}
            <Section
              id="overview"
              title="Situation Overview"
              icon={Target}
              expandedSections={expandedSections}
              toggleSection={toggleSection}
            >
              <div className="space-y-4">
                <p className="text-sm text-gray-800">
                  {result.overview?.situationSummary}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {result.overview?.theirPosition && (
                    <InfoCard
                      label="Their Position"
                      value={result.overview.theirPosition}
                      color="red"
                    />
                  )}
                  {result.overview?.theirValue && (
                    <InfoCard
                      label="Their Value"
                      value={result.overview.theirValue}
                      color="red"
                    />
                  )}
                  {result.overview?.currentStage && (
                    <InfoCard
                      label="Stage"
                      value={result.overview.currentStage}
                      color="orange"
                    />
                  )}
                  {result.overview?.tone && (
                    <InfoCard
                      label="Tone"
                      value={result.overview.tone}
                      color="gray"
                    />
                  )}
                </div>
              </div>
            </Section>

            {/* Email Analysis / Timeline */}
            {result.emailAnalysis && (
              <Section
                id="emailAnalysis"
                title="Email Timeline"
                icon={Mail}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                badge={`${result.emailAnalysis.timeline?.length || 0} emails`}
              >
                <div className="space-y-3">
                  {result.emailAnalysis.timeline?.map(
                    (entry: any, i: number) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-lg border p-4",
                          entry.from === "Us" || entry.from === "us"
                            ? "border-green-100 bg-green-50/50"
                            : "border-red-100 bg-red-50/50"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={cn(
                              "text-xs font-bold uppercase px-2 py-0.5 rounded",
                              entry.from === "Us" || entry.from === "us"
                                ? "bg-green-200 text-green-800"
                                : "bg-red-200 text-red-800"
                            )}
                          >
                            {entry.from}
                          </span>
                          {entry.date && (
                            <span className="text-xs text-gray-500">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1 mb-2">
                          {entry.keyPoints?.map((pt: string, j: number) => (
                            <li
                              key={j}
                              className="text-sm text-gray-700 flex items-start gap-1.5"
                            >
                              <span className="text-gray-400 mt-0.5">•</span>{" "}
                              {pt}
                            </li>
                          ))}
                        </ul>
                        {entry.movementOrConcession && (
                          <div className="text-xs text-orange-700 bg-orange-100 rounded px-2 py-1 inline-block">
                            Movement: {entry.movementOrConcession}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  {result.emailAnalysis.patterns?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        IA Behavior Patterns
                      </div>
                      <ul className="space-y-1.5">
                        {result.emailAnalysis.patterns.map(
                          (p: string, i: number) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-gray-700"
                            >
                              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                              {p}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Document Critique */}
            {result.documentCritique && result.documentCritique.length > 0 && (
              <Section
                id="documentCritique"
                title="Document Critique"
                icon={FileText}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                badge={`${result.documentCritique.length} doc${result.documentCritique.length > 1 ? "s" : ""}`}
              >
                <div className="space-y-6">
                  {result.documentCritique.map((doc: any, di: number) => (
                    <div key={di} className="space-y-3">
                      {result.documentCritique.length > 1 && (
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-900">
                            {doc.document || doc.documentType}
                          </span>
                          {doc.documentType && doc.document && (
                            <span className="text-xs text-gray-400">
                              ({doc.documentType})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Issues */}
                      {doc.issues?.map((c: any, i: number) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded-lg border p-4",
                            c.severity === "high"
                              ? "border-red-200 bg-red-50/50"
                              : c.severity === "medium"
                              ? "border-amber-200 bg-amber-50/50"
                              : "border-gray-200 bg-gray-50"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                                c.severity === "high"
                                  ? "bg-red-200 text-red-800"
                                  : c.severity === "medium"
                                  ? "bg-amber-200 text-amber-800"
                                  : "bg-gray-200 text-gray-700"
                              )}
                            >
                              {c.severity}
                            </span>
                            <span className="font-medium text-sm text-gray-900">
                              {c.issue}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">
                            {c.explanation}
                          </p>
                          {c.counterPoint && (
                            <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-gray-200">
                              <Target className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-orange-700 mb-0.5">
                                  Counter-Point
                                </div>
                                <p className="text-sm text-gray-800">
                                  {c.counterPoint}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Missing */}
                      {doc.missingItems?.length > 0 && (
                        <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                          <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
                            Missing from Document
                          </div>
                          <ul className="space-y-1">
                            {doc.missingItems.map((m: string, i: number) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm text-gray-700"
                              >
                                <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Favorable */}
                      {doc.favorableItems?.length > 0 && (
                        <div className="rounded-lg border border-green-100 bg-green-50/30 p-4">
                          <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">
                            Supports Our Position
                          </div>
                          <ul className="space-y-1">
                            {doc.favorableItems.map((f: string, i: number) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm text-gray-700"
                              >
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* IA Weaknesses */}
            {result.iaWeaknesses?.length > 0 && (
              <Section
                id="iaWeaknesses"
                title="IA Weaknesses — Exploit These"
                icon={AlertTriangle}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                badge={`${result.iaWeaknesses.length} found`}
              >
                <div className="space-y-4">
                  {result.iaWeaknesses.map((w: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-red-100 bg-red-50/50 p-4"
                    >
                      <div className="font-medium text-sm text-red-900 mb-1">
                        {w.point}
                      </div>
                      <p className="text-sm text-gray-700 mb-2">
                        {w.explanation}
                      </p>
                      <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-red-100">
                        <Target className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-medium text-orange-700 mb-0.5">
                            Counter-Argument
                          </div>
                          <p className="text-sm text-gray-800">
                            {w.counterArgument}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Our Weaknesses */}
            {result.ourWeaknesses?.length > 0 && (
              <Section
                id="ourWeaknesses"
                title="Our Weaknesses — Fix These"
                icon={AlertCircle}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                badge={`${result.ourWeaknesses.length}`}
              >
                <div className="space-y-4">
                  {result.ourWeaknesses.map((w: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-amber-200 bg-amber-50/50 p-4"
                    >
                      <div className="font-medium text-sm text-amber-900 mb-1">
                        {w.point}
                      </div>
                      <p className="text-sm text-gray-700 mb-2">
                        {w.explanation}
                      </p>
                      <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-amber-200">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-medium text-green-700 mb-0.5">
                            How to Fix
                          </div>
                          <p className="text-sm text-gray-800">
                            {w.fix}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* IA Strengths */}
            {result.iaStrengths?.length > 0 && (
              <Section
                id="iaStrengths"
                title="IA Strong Points — Handle These"
                icon={Shield}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                badge={`${result.iaStrengths.length}`}
              >
                <div className="space-y-3">
                  {result.iaStrengths.map((s: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-blue-100 bg-blue-50/50 p-4"
                    >
                      <div className="font-medium text-sm text-blue-900 mb-1">
                        {s.point}
                      </div>
                      <p className="text-sm text-gray-700">{s.strategy}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Strategy */}
            <Section
              id="strategy"
              title="Negotiation Strategy"
              icon={Lightbulb}
              expandedSections={expandedSections}
              toggleSection={toggleSection}
            >
              <div className="space-y-4">
                {result.negotiationStrategy?.approach && (
                  <div className="rounded-lg bg-orange-50 border border-orange-100 p-4">
                    <div className="text-xs font-medium text-orange-700 uppercase tracking-wide mb-1">
                      Recommended Approach
                    </div>
                    <p className="text-sm text-gray-800">
                      {result.negotiationStrategy.approach}
                    </p>
                  </div>
                )}

                {result.negotiationStrategy?.tips?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Tactical Tips
                    </div>
                    <ul className="space-y-2">
                      {result.negotiationStrategy.tips.map(
                        (tip: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-gray-800"
                          >
                            <span className="text-orange-500 mt-1">•</span>
                            {tip}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {result.negotiationStrategy?.leveragePoints?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Leverage Points
                    </div>
                    <ul className="space-y-2">
                      {result.negotiationStrategy.leveragePoints.map(
                        (lp: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-gray-800"
                          >
                            <Shield className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                            {lp}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {result.negotiationStrategy?.keyDataToGather?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Evidence to Gather
                    </div>
                    <ul className="space-y-2">
                      {result.negotiationStrategy.keyDataToGather.map(
                        (item: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-gray-800"
                          >
                            <Search className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            {item}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </Section>

            {/* Suggested Response */}
            {result.suggestedResponse && (
              <Section
                id="response"
                title="Suggested Email Response"
                icon={Mail}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
              >
                <div className="relative">
                  <button
                    onClick={() =>
                      copyToClipboard(result.suggestedResponse, "response")
                    }
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors z-10"
                    title="Copy to clipboard"
                  >
                    {copiedField === "response" ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <div className="rounded-lg bg-gray-900 text-gray-100 p-5 text-sm font-mono whitespace-pre-wrap leading-relaxed pr-12">
                    {result.suggestedResponse}
                  </div>
                </div>
              </Section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Helpers ─── */

function Section({
  id,
  title,
  icon: Icon,
  expandedSections,
  toggleSection,
  badge,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Shield;
  expandedSections: Set<string>;
  toggleSection: (s: string) => void;
  badge?: string;
  children: React.ReactNode;
}) {
  const open = expandedSections.has(id);
  return (
    <Card>
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-orange-600" />
          <span className="font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <CardContent className="pt-0 pb-6">{children}</CardContent>}
    </Card>
  );
}

function InfoCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "red" | "green" | "orange" | "gray";
}) {
  const styles = {
    red: "bg-red-50 border-red-100 text-red-700",
    green: "bg-green-50 border-green-100 text-green-700",
    orange: "bg-orange-50 border-orange-100 text-orange-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={cn("rounded-lg border p-3", styles[color])}>
      <div className="text-xs font-medium uppercase tracking-wide mb-1 opacity-80">
        {label}
      </div>
      <div className="text-sm font-semibold text-gray-900 capitalize">
        {value}
      </div>
    </div>
  );
}
