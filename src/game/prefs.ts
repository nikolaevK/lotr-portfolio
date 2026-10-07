/** The visitor asked their OS for less motion: skip flyovers, damp shake. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
