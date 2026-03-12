import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { extractText: extract } = await import("unpdf");
  const result = await extract(new Uint8Array(buffer), { mergePages: true });
  return typeof result.text === "string"
    ? result.text
    : (result.text as string[]).join("\n");
}

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type.toLowerCase();

  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPDF(buffer);
  }
  if (type.startsWith("image/")) {
    const { extractTextFromImage } = await import("@/lib/image-extractor");
    return extractTextFromImage(buffer);
  }
  return buffer.toString("utf-8");
}

const systemPrompt = `You are an expert insurance appraisal negotiation strategist working for an independent appraiser. You specialize in the appraisal clause process for auto insurance claims, where two appraisers (one for the insured, one for the insurance company) negotiate the actual cash value (ACV) of a vehicle or the cost of repairs.

Your role is to help the independent appraiser (our user) win negotiations against the insurance company's appraiser (IA). You understand:

- Vehicle valuation methods (market comparables, dealer retail, private party, auction values)
- Depreciation and condition adjustments
- How to identify weak arguments in the opposing appraiser's position
- Common insurance company tactics to undervalue claims
- State appraisal clause laws and procedures
- How to construct persuasive, professional counter-arguments
- Repair cost disputes, supplement negotiations, and total loss valuations
- OEM vs aftermarket vs used parts arguments
- Labor rate disputes and methodology differences

Always be strategic, professional, and assertive. Identify every weakness in the opposing position and provide ammunition for our side.

Always respond with valid JSON only. No markdown, no explanation outside the JSON.`;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.error("FormData parse error:", err);
      return NextResponse.json(
        { error: "Failed to parse form data" },
        { status: 400 }
      );
    }

    const context = formData.get("context") as string | null;
    const emailText = formData.get("emailText") as string | null;
    const emailChainFiles = (formData.getAll("emailChain") || []).filter(
      (f): f is File => f instanceof File && f.size > 0
    );
    const documentFiles = (formData.getAll("documents") || []).filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    // Build content sections
    const sections: string[] = [];

    // 1. Pasted email text
    if (emailText?.trim()) {
      sections.push(`=== PASTED EMAIL / TEXT ===\n${emailText.trim()}`);
    }

    // 2. Email chain files
    if (emailChainFiles.length > 0) {
      try {
        const chainTexts = await Promise.all(
          emailChainFiles.map(async (f) => {
            const text = await extractText(f);
            return `[${f.name}]\n${text}`;
          })
        );
        sections.push(`=== EMAIL CHAIN ===\n${chainTexts.join("\n\n")}`);
      } catch (err) {
        console.error("Email chain extraction error:", err);
        return NextResponse.json(
          { error: `Failed to extract text from email chain: ${err instanceof Error ? err.message : "Unknown error"}` },
          { status: 500 }
        );
      }
    }

    // 3. Claim documents
    if (documentFiles.length > 0) {
      try {
        const docTexts = await Promise.all(
          documentFiles.map(async (f) => {
            const text = await extractText(f);
            return `[${f.name}]\n${text}`;
          })
        );
        sections.push(`=== CLAIM DOCUMENTS ===\n${docTexts.join("\n\n---\n\n")}`);
      } catch (err) {
        console.error("Document extraction error:", err);
        return NextResponse.json(
          { error: `Failed to extract text from documents: ${err instanceof Error ? err.message : "Unknown error"}` },
          { status: 500 }
        );
      }
    }

    if (sections.length === 0) {
      return NextResponse.json(
        { error: "No content provided to analyze" },
        { status: 400 }
      );
    }

    const hasEmail = !!(emailText?.trim()) || emailChainFiles.length > 0;
    const hasDocs = documentFiles.length > 0;

    const userPrompt = `Analyze the provided materials and give a negotiation strategy. Be CONCISE — each field should be 1-3 sentences max. Limit arrays to 3-5 items. The suggestedResponse should be a professional but brief email (under 300 words).

${context ? `CONTEXT:\n${context}\n\n` : ""}${sections.join("\n\n")}

Return JSON with this structure. Use null for sections without applicable data:
{
  "overview": {
    "situationSummary": "1-2 sentence summary",
    "theirPosition": "their argument",
    "theirValue": "$amount or null",
    "currentStage": "early/mid/near resolution/stalled",
    "tone": "aggressive/cooperative/dismissive/etc"
  },
  ${hasEmail ? `"emailAnalysis": {
    "timeline": [{"from": "Us or IA", "date": "date or null", "keyPoints": ["point"], "movementOrConcession": "movement or null"}],
    "patterns": ["pattern"]
  },` : `"emailAnalysis": null,`}
  ${hasDocs ? `"documentCritique": [{"document": "name", "documentType": "type", "issues": [{"issue": "problem", "severity": "high/medium/low", "explanation": "why", "counterPoint": "counter"}], "missingItems": ["missing"], "favorableItems": ["favorable"]}],` : `"documentCritique": null,`}
  "weaknesses": [{"point": "weakness", "explanation": "why weak", "counterArgument": "counter"}],
  "strengths": [{"point": "their strong point", "strategy": "how to handle"}],
  "negotiationStrategy": {
    "approach": "recommended approach",
    "tips": ["tip"],
    "keyDataToGather": ["data needed"],
    "leveragePoints": ["leverage"]
  },
  "suggestedResponse": "Professional email response under 300 words"
}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let result;
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("Parse error, raw response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Negotiations analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
