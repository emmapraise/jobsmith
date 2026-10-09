/**
 * Start a file download without navigating the page. Setting window.location to a download URL aborts any in-flight
 * request (Safari kills Next's router.refresh() fetch and then reloads the page, cancelling the download).
 * The server sends Content-Disposition: attachment, so a plain link click downloads and the page stays put.
 */
export function startDownload(url: string, fileName?: string): void {
  const a = document.createElement("a");
  a.href = url;
  if (fileName) a.download = fileName; // honoured for same-origin; cross-origin (R2) relies on Content-Disposition
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
