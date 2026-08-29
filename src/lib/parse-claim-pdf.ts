import { parseClaim, type ParsedClaim } from '@/lib/acv/parsers'

async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamic import to avoid SSR issues (pdfjs-dist needs DOMMatrix/canvas).
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const parts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      parts.push(item.str)
      if ('hasEOL' in item && item.hasEOL) parts.push('\n')
    }
  }

  return parts.join('')
}

async function ocrPDF(file: File): Promise<string> {
  const Tesseract = await import('tesseract.js')
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const parts: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport } as any).promise
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    )
    const buffer = Buffer.from(await blob.arrayBuffer())
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {},
    })
    parts.push(text)
  }

  return parts.join('\n')
}

export type { ParsedClaim } from '@/lib/acv/parsers'

export async function parseClaimPDF(file: File): Promise<ParsedClaim> {
  let text = await extractTextFromPDF(file)
  if (!text || text.trim().length < 20) {
    text = await ocrPDF(file)
  }
  if (!text || text.trim().length < 20) {
    throw new Error('Could not extract text from PDF.')
  }
  return parseClaim(text)
}
