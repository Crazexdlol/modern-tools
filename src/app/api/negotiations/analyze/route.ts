import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromPDF } from "@/lib/pdf-extractor";
import { extractTextFromImage } from "@/lib/image-extractor";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type.toLowerCase();

  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPDF(buffer);
  }
  if (type.startsWith("image/")) {
    return extractTextFromImage(buffer);
  }
  // Try as plain text
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const mode = formData.get("mode") as string; // "email" | "document" | "email-chain"
    const context = formData.get("context") as string | null;
    const content = formData.get("content") as string | null; // pasted text
    const files = formData.getAll("files") as File[];

    // Extract text from files if provided
    let extractedTexts: { name: string; text: string }[] = [];
    if (files.length > 0) {
      extractedTexts = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          text: await extractText(file),
        }))
      );
    }

    const allContent = [
      content ? `PASTED CONTENT:\n${content}` : "",
      ...extractedTexts.map((f) => `FILE: ${f.name}\n${f.text}`),
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!allContent.trim()) {
      return NextResponse.json(
        { error: "No content provided to analyze" },
        { status: 400 }
      );
    }

    let userPrompt = "";

    if (mode === "email") {
      userPrompt = `Analyze this email from the insurance company's appraiser (IA) and help me craft a strong response.

${context ? `NEGOTIATION CONTEXT:\n${context}\n\n` : ""}EMAIL CONTENT:
${allContent}

Return a JSON object with this exact structure:
{
  "analysis": {
    "theirPosition": "Summary of the IA's position and what they're arguing",
    "theirValue": "The value or position they're pushing for (if mentioned)",
    "tone": "Assessment of their tone (aggressive, cooperative, dismissive, etc.)",
    "confidence": "How confident they seem in their position (high/medium/low)"
  },
  "weaknesses": [
    {
      "point": "A specific weak point in their argument",
      "explanation": "Why this is weak",
      "counterArgument": "How to counter this specific point"
    }
  ],
  "strengths": [
    {
      "point": "A strong point they made that we need to address carefully",
      "strategy": "How to handle or neutralize this point"
    }
  ],
  "negotiationTips": [
    "Specific tactical advice for this negotiation"
  ],
  "suggestedResponse": "A complete, professional email response that addresses their points, presents counter-arguments, and advances our position. Write this as a ready-to-send email.",
  "keyDataToGather": [
    "Specific data, comps, or evidence that would strengthen our position"
  ]
}`;
    } else if (mode === "email-chain") {
      userPrompt = `Analyze this email chain between me (the independent appraiser) and the insurance company's appraiser (IA). Track the full negotiation progression and help me with next steps.

${context ? `NEGOTIATION CONTEXT:\n${context}\n\n` : ""}EMAIL CHAIN:
${allContent}

Return a JSON object with this exact structure:
{
  "analysis": {
    "negotiationSummary": "Overview of how the negotiation has progressed",
    "currentStage": "Where we are in the negotiation (early, mid, near resolution, stalled, etc.)",
    "ourPosition": "Summary of our stated position through the chain",
    "theirPosition": "Summary of the IA's stated position through the chain",
    "gapRemaining": "The gap between positions (dollar amount or description)"
  },
  "timeline": [
    {
      "from": "who sent this email (Us/IA)",
      "date": "date if available",
      "keyPoints": ["main points made in this email"],
      "movementOrConcession": "any movement in position or concession made"
    }
  ],
  "weaknesses": [
    {
      "point": "A weakness in the IA's overall position across the chain",
      "explanation": "Why this is weak",
      "counterArgument": "How to exploit this"
    }
  ],
  "patterns": [
    "Patterns in the IA's negotiation behavior (stalling, anchoring, cherry-picking, etc.)"
  ],
  "negotiationTips": [
    "Specific tactical advice for the next move"
  ],
  "suggestedResponse": "A complete, professional email response for the next step in this negotiation. Build on the chain history and advance our position strategically.",
  "keyDataToGather": [
    "Specific evidence or data that would help close the gap"
  ]
}`;
    } else {
      // document mode
      userPrompt = `Analyze this document from the insurance company's appraiser (IA) and provide a thorough critique from our perspective as the independent appraiser.

${context ? `NEGOTIATION CONTEXT:\n${context}\n\n` : ""}DOCUMENT:
${allContent}

Return a JSON object with this exact structure:
{
  "documentType": "What type of document this is (ACV report, repair estimate, comp analysis, invoice, valuation report, etc.)",
  "summary": "Brief summary of what this document contains and its purpose",
  "critique": [
    {
      "issue": "A specific problem, error, or questionable item in the document",
      "severity": "high | medium | low",
      "explanation": "Detailed explanation of why this is problematic",
      "counterPoint": "How to argue against this specific item",
      "evidence": "What evidence or data would support our counter-argument"
    }
  ],
  "missingItems": [
    "Things that should be in this document but are missing or omitted"
  ],
  "favorableItems": [
    "Items in the document that actually support OUR position"
  ],
  "negotiationLeverage": [
    "How to use findings from this document in negotiations"
  ],
  "suggestedActions": [
    "Specific next steps to take based on this document analysis"
  ]
}`;
    }

    const stream = await client.beta.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      betas: ["output-128k-2025-02-19"],
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const message = await stream.finalMessage();
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

    return NextResponse.json({ result, mode });
  } catch (error) {
    console.error("Negotiations analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
