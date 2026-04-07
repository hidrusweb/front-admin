import jsPDF from 'jspdf';
import { logoHydrusHorizontalAbsoluteUrl } from './branding';

/** Logo horizontal para PDF (mesma arte da tela). */
export async function loadHydrusLogoForPdf(
  maxWidthMm: number
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const url = logoHydrusHorizontalAbsoluteUrl();
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error('read'));
      fr.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img'));
      img.src = dataUrl;
    });
    const w = maxWidthMm;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const h = nw > 0 ? (nh / nw) * w : maxWidthMm * 0.25;
    return { dataUrl, w, h };
  } catch {
    return null;
  }
}

export function addFooterPageNumbers(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
}
