"use client";

import { useState, useCallback } from "react";
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
  FileUp,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Mode = "email" | "email-chain" | "document";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnalysisResult = any;

export default function NegotiationsPage() {
  const [mode, setMode] = useState<Mode>("email");
  const [pastedContent, setPastedContent] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultMode, setResultMode] = useState<Mode>("email");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["analysis", "weaknesses", "response", "critique", "timeline"])
  );

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
      "text/plain": [".txt"],
    },
    multiple: mode === "document",
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

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

  const handleAnalyze = async () => {
    if (!pastedContent.trim() && files.length === 0) {
      setError("Please paste content or upload files to analyze.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("mode", mode);
      if (pastedContent.trim()) formData.append("content", pastedContent);
      if (context.trim()) formData.append("context", context);
      files.forEach((file) => formData.append("files", file));

      const res = await fetch("/api/negotiations/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();
      setResult(data.result);
      setResultMode(data.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setPastedContent("");
    setContext("");
    setFiles([]);
    setError(null);
  };

  const modes: { id: Mode; label: string; icon: typeof Mail; desc: string }[] = [
    { id: "email", label: "Paste Email", icon: Mail, desc: "Paste an email from the IA to get a strategic response" },
    { id: "email-chain", label: "Email Chain", icon: Files, desc: "Upload a PDF of the full email thread for analysis" },
    { id: "document", label: "Document", icon: FileUp, desc: "Upload invoices, comps, reports to critique" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/">
            <Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-white transition-colors">Negotiations</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Back + Title */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Negotiations</h1>
            <p className="text-sm text-gray-500">Analyze emails & documents to build your negotiation strategy</p>
          </div>
        </div>

        {!result ? (
          /* ─── INPUT VIEW ─── */
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Mode Selector */}
            <div className="grid grid-cols-3 gap-3">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setFiles([]); }}
                    className={cn(
                      "relative rounded-lg border-2 p-4 text-left transition-all",
                      mode === m.id
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    )}
                  >
                    <Icon className={cn("w-5 h-5 mb-2", mode === m.id ? "text-orange-600" : "text-gray-400")} />
                    <div className="font-semibold text-sm">{m.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Context */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">Negotiation Context (optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Provide background: vehicle info, your appraised value, their offer, what's being disputed, claim number, etc. The more context the better."
                  className="w-full min-h-[80px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y placeholder:text-gray-400"
                />
              </CardContent>
            </Card>

            {/* Input Area */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">
                  {mode === "email" ? "Paste Email Content" : mode === "email-chain" ? "Upload Email Chain" : "Upload Documents"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Text paste area — always shown for email mode, optional for others */}
                {(mode === "email" || mode === "email-chain") && (
                  <textarea
                    value={pastedContent}
                    onChange={(e) => setPastedContent(e.target.value)}
                    placeholder={
                      mode === "email"
                        ? "Paste the IA's email here..."
                        : "Paste the email chain here, or upload a PDF below..."
                    }
                    className="w-full min-h-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y placeholder:text-gray-400"
                  />
                )}

                {/* File upload — always shown for chain/document, optional for email */}
                {(mode === "email-chain" || mode === "document" || (mode === "email" && !pastedContent.trim())) && (
                  <>
                    {mode === "email" && !pastedContent.trim() && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <div className="flex-1 border-t border-gray-200" />
                        <span>or upload a file</span>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>
                    )}
                    <div
                      {...getRootProps()}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                        isDragActive
                          ? "border-orange-400 bg-orange-50"
                          : "border-gray-300 hover:border-gray-400 bg-gray-50"
                      )}
                    >
                      <input {...getInputProps()} />
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-600">
                        {isDragActive
                          ? "Drop files here..."
                          : mode === "document"
                          ? "Drag & drop PDFs, images, or text files — or click to browse"
                          : "Drag & drop a PDF or image — or click to browse"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG, TXT supported</p>
                    </div>
                  </>
                )}

                {/* File list */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                        <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
              disabled={loading || (!pastedContent.trim() && files.length === 0)}
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold">Negotiation Strategy</h2>
              </div>
              <Button variant="outline" onClick={handleReset}>
                <ArrowLeft className="w-4 h-4 mr-1" /> New Analysis
              </Button>
            </div>

            {resultMode === "email" && <EmailResults result={result} expandedSections={expandedSections} toggleSection={toggleSection} copyToClipboard={copyToClipboard} copiedField={copiedField} />}
            {resultMode === "email-chain" && <EmailChainResults result={result} expandedSections={expandedSections} toggleSection={toggleSection} copyToClipboard={copyToClipboard} copiedField={copiedField} />}
            {resultMode === "document" && <DocumentResults result={result} expandedSections={expandedSections} toggleSection={toggleSection} />}
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── COLLAPSIBLE SECTION ─── */
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
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <CardContent className="pt-0 pb-6">{children}</CardContent>}
    </Card>
  );
}

/* ─── EMAIL RESULTS ─── */
function EmailResults({
  result,
  expandedSections,
  toggleSection,
  copyToClipboard,
  copiedField,
}: {
  result: AnalysisResult;
  expandedSections: Set<string>;
  toggleSection: (s: string) => void;
  copyToClipboard: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  const a = result.analysis || {};
  return (
    <div className="space-y-4">
      {/* Analysis Overview */}
      <Section id="analysis" title="Their Position" icon={Target} expandedSections={expandedSections} toggleSection={toggleSection}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Position</div>
              <p className="text-sm text-gray-800">{a.theirPosition}</p>
            </div>
            {a.theirValue && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Their Value</div>
                <p className="text-sm font-semibold text-gray-900">{a.theirValue}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tone</div>
              <p className="text-sm text-gray-800 capitalize">{a.tone}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Confidence Level</div>
              <p className="text-sm text-gray-800 capitalize">{a.confidence}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Weaknesses */}
      <Section id="weaknesses" title="Weaknesses in Their Argument" icon={AlertTriangle} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.weaknesses?.length || 0} found`}>
        <div className="space-y-4">
          {result.weaknesses?.map((w: any, i: number) => (
            <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-4">
              <div className="font-medium text-sm text-red-900 mb-1">{w.point}</div>
              <p className="text-sm text-gray-700 mb-2">{w.explanation}</p>
              <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-red-100">
                <Target className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-medium text-orange-700 mb-0.5">Counter-Argument</div>
                  <p className="text-sm text-gray-800">{w.counterArgument}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Strengths to Address */}
      {result.strengths?.length > 0 && (
        <Section id="strengths" title="Strong Points to Address" icon={Shield} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.strengths.length}`}>
          <div className="space-y-3">
            {result.strengths.map((s: any, i: number) => (
              <div key={i} className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <div className="font-medium text-sm text-blue-900 mb-1">{s.point}</div>
                <p className="text-sm text-gray-700">{s.strategy}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tips */}
      <Section id="tips" title="Negotiation Tips" icon={Lightbulb} expandedSections={expandedSections} toggleSection={toggleSection}>
        <ul className="space-y-2">
          {result.negotiationTips?.map((tip: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <span className="text-orange-500 mt-1">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      {/* Suggested Response */}
      <Section id="response" title="Suggested Email Response" icon={Mail} expandedSections={expandedSections} toggleSection={toggleSection}>
        <div className="relative">
          <button
            onClick={() => copyToClipboard(result.suggestedResponse, "response")}
            className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Copy to clipboard"
          >
            {copiedField === "response" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
          </button>
          <div className="rounded-lg bg-gray-900 text-gray-100 p-5 text-sm font-mono whitespace-pre-wrap leading-relaxed pr-12">
            {result.suggestedResponse}
          </div>
        </div>
      </Section>

      {/* Data to Gather */}
      {result.keyDataToGather?.length > 0 && (
        <Section id="data" title="Evidence to Gather" icon={Search} expandedSections={expandedSections} toggleSection={toggleSection}>
          <ul className="space-y-2">
            {result.keyDataToGather.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <Search className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/* ─── EMAIL CHAIN RESULTS ─── */
function EmailChainResults({
  result,
  expandedSections,
  toggleSection,
  copyToClipboard,
  copiedField,
}: {
  result: AnalysisResult;
  expandedSections: Set<string>;
  toggleSection: (s: string) => void;
  copyToClipboard: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  const a = result.analysis || {};
  return (
    <div className="space-y-4">
      {/* Overview */}
      <Section id="analysis" title="Negotiation Overview" icon={Target} expandedSections={expandedSections} toggleSection={toggleSection}>
        <div className="space-y-4">
          <p className="text-sm text-gray-800">{a.negotiationSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
              <div className="text-xs font-medium text-orange-700 mb-1">Stage</div>
              <div className="text-sm font-semibold text-gray-900 capitalize">{a.currentStage}</div>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 p-3">
              <div className="text-xs font-medium text-green-700 mb-1">Our Position</div>
              <div className="text-sm text-gray-900">{a.ourPosition}</div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <div className="text-xs font-medium text-red-700 mb-1">Their Position</div>
              <div className="text-sm text-gray-900">{a.theirPosition}</div>
            </div>
          </div>
          {a.gapRemaining && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Gap remaining:</span> {a.gapRemaining}
            </div>
          )}
        </div>
      </Section>

      {/* Timeline */}
      <Section id="timeline" title="Negotiation Timeline" icon={Files} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.timeline?.length || 0} emails`}>
        <div className="space-y-3">
          {result.timeline?.map((entry: any, i: number) => (
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
                {entry.date && <span className="text-xs text-gray-500">{entry.date}</span>}
              </div>
              <ul className="space-y-1 mb-2">
                {entry.keyPoints?.map((pt: string, j: number) => (
                  <li key={j} className="text-sm text-gray-700 flex items-start gap-1.5">
                    <span className="text-gray-400 mt-0.5">•</span> {pt}
                  </li>
                ))}
              </ul>
              {entry.movementOrConcession && (
                <div className="text-xs text-orange-700 bg-orange-100 rounded px-2 py-1 inline-block">
                  Movement: {entry.movementOrConcession}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Weaknesses */}
      <Section id="weaknesses" title="Weaknesses in Their Position" icon={AlertTriangle} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.weaknesses?.length || 0}`}>
        <div className="space-y-4">
          {result.weaknesses?.map((w: any, i: number) => (
            <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-4">
              <div className="font-medium text-sm text-red-900 mb-1">{w.point}</div>
              <p className="text-sm text-gray-700 mb-2">{w.explanation}</p>
              <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-red-100">
                <Target className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-800">{w.counterArgument}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Patterns */}
      {result.patterns?.length > 0 && (
        <Section id="patterns" title="IA Behavior Patterns" icon={Search} expandedSections={expandedSections} toggleSection={toggleSection}>
          <ul className="space-y-2">
            {result.patterns.map((p: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Tips */}
      <Section id="tips" title="Next Move Strategy" icon={Lightbulb} expandedSections={expandedSections} toggleSection={toggleSection}>
        <ul className="space-y-2">
          {result.negotiationTips?.map((tip: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <span className="text-orange-500 mt-1">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </Section>

      {/* Response */}
      <Section id="response" title="Suggested Next Email" icon={Mail} expandedSections={expandedSections} toggleSection={toggleSection}>
        <div className="relative">
          <button
            onClick={() => copyToClipboard(result.suggestedResponse, "response")}
            className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {copiedField === "response" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
          </button>
          <div className="rounded-lg bg-gray-900 text-gray-100 p-5 text-sm font-mono whitespace-pre-wrap leading-relaxed pr-12">
            {result.suggestedResponse}
          </div>
        </div>
      </Section>

      {/* Data to Gather */}
      {result.keyDataToGather?.length > 0 && (
        <Section id="data" title="Evidence to Gather" icon={Search} expandedSections={expandedSections} toggleSection={toggleSection}>
          <ul className="space-y-2">
            {result.keyDataToGather.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <Search className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/* ─── DOCUMENT RESULTS ─── */
function DocumentResults({
  result,
  expandedSections,
  toggleSection,
}: {
  result: AnalysisResult;
  expandedSections: Set<string>;
  toggleSection: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Document Summary */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-sm text-gray-500 uppercase tracking-wide">{result.documentType}</span>
          </div>
          <p className="text-sm text-gray-800">{result.summary}</p>
        </CardContent>
      </Card>

      {/* Critique */}
      <Section id="critique" title="Document Critique" icon={AlertTriangle} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.critique?.length || 0} issues`}>
        <div className="space-y-4">
          {result.critique?.map((c: any, i: number) => (
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
                <span className="font-medium text-sm text-gray-900">{c.issue}</span>
              </div>
              <p className="text-sm text-gray-700 mb-2">{c.explanation}</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-gray-200">
                  <Target className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-orange-700 mb-0.5">Counter-Point</div>
                    <p className="text-sm text-gray-800">{c.counterPoint}</p>
                  </div>
                </div>
                {c.evidence && (
                  <div className="flex items-start gap-2 bg-white rounded-md p-3 border border-gray-200">
                    <Search className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-0.5">Supporting Evidence</div>
                      <p className="text-sm text-gray-800">{c.evidence}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Missing Items */}
      {result.missingItems?.length > 0 && (
        <Section id="missing" title="Missing from Document" icon={AlertCircle} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.missingItems.length}`}>
          <ul className="space-y-2">
            {result.missingItems.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Favorable Items */}
      {result.favorableItems?.length > 0 && (
        <Section id="favorable" title="Items Favoring Our Position" icon={CheckCircle2} expandedSections={expandedSections} toggleSection={toggleSection} badge={`${result.favorableItems.length}`}>
          <ul className="space-y-2">
            {result.favorableItems.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Leverage */}
      <Section id="leverage" title="Negotiation Leverage" icon={Shield} expandedSections={expandedSections} toggleSection={toggleSection}>
        <ul className="space-y-2">
          {result.negotiationLeverage?.map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <Shield className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      {/* Actions */}
      <Section id="actions" title="Suggested Next Steps" icon={Lightbulb} expandedSections={expandedSections} toggleSection={toggleSection}>
        <ol className="space-y-2">
          {result.suggestedActions?.map((action: string, i: number) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-800">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              {action}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
