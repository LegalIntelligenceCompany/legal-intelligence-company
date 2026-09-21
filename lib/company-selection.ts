// Only the selection is retained; never cache contracts, policies or session tokens here.
const key = "lic-selected-company";
export function readCompanySelection() {
  try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; }
}
export function saveCompanySelection(id: string) {
  try { window.localStorage.setItem(key, id); } catch { /* Selection still works in memory. */ }
}
