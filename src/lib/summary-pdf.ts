import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

// Renders the hidden SummaryPrintDoc portal (.summary-print-portal) to a
// paginated Letter-size PDF blob, so a copy of the printed summary can be
// auto-saved into the claim's Documents tab. The portal is display:none on
// screen; html2canvas works on a clone where we force it visible.
export async function captureSummaryPdf(): Promise<Blob | null> {
  const el = document.querySelector('.summary-print-portal') as HTMLElement | null
  if (!el) return null

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    windowWidth: 816, // 8.5in at 96dpi
    onclone: (clonedDoc) => {
      const clone = clonedDoc.querySelector('.summary-print-portal') as HTMLElement | null
      if (clone) {
        clone.style.display = 'block'
        clone.style.position = 'static'
        clone.style.width = '816px'
        clone.style.background = '#ffffff'
      }
      const printDoc = clonedDoc.querySelector('.print-doc') as HTMLElement | null
      if (printDoc) printDoc.style.display = 'block'
    },
  })

  const pageWidthPt = 612 // Letter, points
  const pageHeightPt = 792
  const pxPerPt = canvas.width / pageWidthPt
  const pageHeightPx = Math.floor(pageHeightPt * pxPerPt)

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  let offset = 0
  let first = true
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceHeight
    const ctx = slice.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
    const img = slice.toDataURL('image/jpeg', 0.92)
    if (!first) pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, 0, pageWidthPt, sliceHeight / pxPerPt)
    first = false
    offset += sliceHeight
  }

  return pdf.output('blob')
}
