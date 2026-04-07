/**
 * Abre a impressão e troca o título da página por um caractere invisível, para o cabeçalho do navegador
 * não mostrar “HIDRUS — Administração” (quando cabeçalhos estão ligados).
 *
 * Data, URL e “página x de y” continuam sendo controlados pelo navegador: no Chrome/Edge use
 * “Mais definições” no diálogo de impressão e desmarque **Cabeçalhos e rodapés**.
 */
export function printMinimizingBrowserDecorations(): void {
  const prevTitle = document.title;
  document.title = '\u200B';

  let done = false;
  const restore = () => {
    if (done) return;
    done = true;
    document.title = prevTitle;
    window.removeEventListener('afterprint', onAfter);
  };

  const onAfter = () => restore();
  window.addEventListener('afterprint', onAfter);
  window.setTimeout(restore, 3_000);

  window.print();
}
