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

    const userPrompt = `Analyze everything I've provided and give me a comprehensive negotiation strategy. I may have provided some or all of: a pasted email/text from the IA, an email chain (PDF/image), and claim documents (invoices, comps, reports, etc.). Use ALL available information together to build the strongest possible position.

${context ? `NEGOTIATION CONTEXT:\n${context}\n\n` : ""}${sections.join("\n\n")}

Return a JSON object with this exact structure. Include ALL sections — if a section isn't applicable based on what was provided, use an empty array or null:
{
  "overview": {
    "situationSummary": "Brief summary of the negotiation situation based on everything provided",
    "theirPosition": "The IA's position, value, or argument (from emails/documents)",
    "theirValue": "Dollar amount they're pushing if mentioned, or null",
    "currentStage": "Where the negotiation stands (early, mid, near resolution, stalled, etc.)",
    "tone": "Assessment of the IA's tone (aggressive, cooperative, dismissive, etc.)"
  },
  ${hasEmail ? `"emailAnalysis": {
    "timeline": [
      {
        "from": "Us or IA",
        "date": "date if available",
        "keyPoints": ["main points made"],
        "movementOrConcession": "any movement in position"
      }
    ],
    "patterns": ["Patterns in IA behavior (stalling, anchoring, cherry-picking, etc.)"]
  },` : `"emailAnalysis": null,`}
  ${hasDocs ? `"documentCritique": [
    {
      "document": "which document this is about",
      "documentType": "ACV report, estimate, comp sheet, invoice, etc.",
      "issues": [
        {
          "issue": "specific problem or questionable item",
          "severity": "high | medium | low",
          "explanation": "why this is problematic",
          "counterPoint": "how to argue against it"
        }
      ],
      "missingItems": ["things that should be in the document but aren't"],
      "favorableItems": ["items that actually support OUR position"]
    }
  ],` : `"documentCritique": null,`}
  "weaknesses": [
    {
      "point": "A specific weakness in the IA's overall position",
      "explanation": "Why this is weak",
      "counterArgument": "How to counter this"
    }
  ],
  "strengths": [
    {
      "point": "A strong point they have that we need to address",
      "strategy": "How to handle or neutralize it"
    }
  ],
  "negotiationStrategy": {
    "approach": "Overall recommended negotiation approach",
    "tips": ["Specific tactical advice"],
    "keyDataToGather": ["Evidence or data that would strengthen our position"],
    "leveragePoints": ["Specific leverage we can use from the provided materials"]
  },
  "suggestedResponse": "A complete, professional email response ready to send. Address their points, present counter-arguments, reference documents where applicable, and advance our position strategically. If no email was provided, write a proactive email based on the document analysis."
}`;

    // Use SSE to stream keepalives, then send final JSON result
    const anthropicStream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: string) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        };

        try {
          let fullText = "";
          for await (const event of anthropicStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              send("ping", "{}");
            }
          }

          const cleaned = fullText
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          const result = JSON.parse(cleaned);
          send("done", JSON.stringify({ result }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          send("done", JSON.stringify({ error: msg }));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Negotiations analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
