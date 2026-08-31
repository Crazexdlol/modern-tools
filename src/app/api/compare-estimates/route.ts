import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromPDF } from "@/lib/pdf-extractor";
import { extractTextFromImage } from "@/lib/image-extractor";
import { detectSoftware } from "@/lib/estimate-parser";
import { requireAuth } from '@/lib/auth/require-admin'

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
  throw new Error(`Unsupported file type: ${type}`);
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAuth()
  if (errorResponse) return errorResponse
  try {
    const formData = await request.formData();
    const estimateA = formData.get("estimateA") as File | null;
    const estimateB = formData.get("estimateB") as File | null;

    if (!estimateA || !estimateB) {
      return NextResponse.json({ error: "Both estimates are required" }, { status: 400 });
    }

    const [textA, textB] = await Promise.all([
      extractText(estimateA),
      extractText(estimateB),
    ]);

    const softwareA = detectSoftware(textA);
    const softwareB = detectSoftware(textB);

    const systemPrompt = `You are an expert auto body estimating analyst specializing in collision repair estimates.
You have deep knowledge of CCC ONE, Mitchell Cloud Estimating, Audatex (Solera), Web-Est, and Estimating Edge software.

Your job is to compare two vehicle damage estimates and identify ALL differences between them.
Different software uses different terminology for the same operations — you must normalize and recognize these.

Key terminology equivalences to know:
- R&R / R/R / Remove & Replace = removing a part and replacing with new
- R&I / R/I / Remove & Install = removing and reinstalling the same part
- Refinish / Ref / Rfsh = paint labor
- Blend / Blnd = blending paint into adjacent panel
- OEM / New = factory part | AFT / A/M / Aftermarket = non-OEM part | LKQ / Used / Recond = used/recycled part
- Body labor, Frame labor, Paint labor, Mechanical labor, Aluminum labor = different labor rate categories
- Sublet = work sent to another shop (glass, alignment, etc.)

Always respond with valid JSON only. No markdown, no explanation outside the JSON.`;

    const userPrompt = `Compare these two auto body repair estimates. Normalize terminology across different estimating software.

ESTIMATE A (${softwareA === "Unknown" ? estimateA.name : softwareA}):
${textA}

---

ESTIMATE B (${softwareB === "Unknown" ? estimateB.name : softwareB}):
${textB}

Return a JSON object with this exact structure:
{
  "summary": {
    "estimateA": {
      "software": "detected software name",
      "fileName": "${estimateA.name}",
      "grandTotal": 0.00,
      "laborTotal": 0.00,
      "partsTotal": 0.00,
      "paintTotal": 0.00,
      "subletTotal": 0.00,
      "taxTotal": 0.00,
      "bodyLaborRate": 0.00,
      "frameLaborRate": 0.00,
      "paintLaborRate": 0.00
    },
    "estimateB": {
      "software": "detected software name",
      "fileName": "${estimateB.name}",
      "grandTotal": 0.00,
      "laborTotal": 0.00,
      "partsTotal": 0.00,
      "paintTotal": 0.00,
      "subletTotal": 0.00,
      "taxTotal": 0.00,
      "bodyLaborRate": 0.00,
      "frameLaborRate": 0.00,
      "paintLaborRate": 0.00
    },
    "totalDifference": 0.00,
    "vehicle": {
      "year": "",
      "make": "",
      "model": "",
      "vin": "",
      "color": ""
    }
  },
  "laborRateDifferences": [
    {
      "rateType": "Body Labor",
      "estimateA": 0.00,
      "estimateB": 0.00,
      "difference": 0.00
    }
  ],
  "lineItemDifferences": [
    {
      "status": "only_in_a | only_in_b | different",
      "category": "Labor | Parts | Paint | Sublet | Other",
      "normalizedOperation": "normalized name",
      "panelOrArea": "e.g. Front Bumper Cover",
      "estimateA": {
        "rawOperation": "",
        "laborHours": 0.0,
        "laborRate": 0.00,
        "laborTotal": 0.00,
        "partType": "",
        "partPrice": 0.00,
        "total": 0.00
      },
      "estimateB": {
        "rawOperation": "",
        "laborHours": 0.0,
        "laborRate": 0.00,
        "laborTotal": 0.00,
        "partType": "",
        "partPrice": 0.00,
        "total": 0.00
      },
      "dollarImpact": 0.00,
      "notes": "explanation of difference"
    }
  ],
  "matchingItems": [
    {
      "normalizedOperation": "",
      "panelOrArea": "",
      "category": ""
    }
  ],
  "keyFindings": [
    "string summary of major difference 1",
    "string summary of major difference 2"
  ]
}`;

    // Use streaming to avoid timeout on large responses
    const stream = await client.beta.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      betas: ["output-128k-2025-02-19"],
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const message = await stream.finalMessage();
    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Stop reason:", message.stop_reason);

    let comparison;
    try {
      const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      comparison = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
      console.error("Full raw response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse AI response — check server logs for details" },
        { status: 500 }
      );
    }

    return NextResponse.json({ comparison, softwareA, softwareB });
  } catch (error) {
    console.error("Compare estimates error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
