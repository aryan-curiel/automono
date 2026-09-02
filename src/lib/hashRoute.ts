import { useCallback, useEffect, useState } from "react";
import type { Screen } from "../types";

// The hash path segment IS the `Screen` union value verbatim — no separate
// route-name mapping to keep in sync. `#/factura-detalle/12` ⇒ screen
// "factura-detalle", record id "12".
const SCREENS = [
  "onboarding",
  "dashboard",
  "clientes",
  "cliente-detalle",
  "cliente-nuevo",
  "cliente-editar",
  "facturas",
  "cobros",
  "conciliacion",
  "factura-detalle",
  "factura-nueva",
  "factura-rectificar",
  "presupuestos",
  "presupuesto-nuevo",
  "presupuesto-editar",
  "contrato-nuevo",
  "contrato-editar",
  "contrato-detalle",
  "bandeja",
  "gastos",
  "gasto-nuevo",
  "gasto-editar",
  "gasto-detalle",
  "resumen-trimestral",
  "resumen-anual",
  "asistente",
  "ajustes",
] as const satisfies readonly Screen[];

// Compile-time guard: fails `tsc` (`bun run build`) if a `Screen` is added to
// the union without being listed above.
type MissingFromScreens = Exclude<Screen, (typeof SCREENS)[number]>;
const _exhaustive: MissingFromScreens extends never ? true : never = true;
void _exhaustive;

export type Route = { screen: Screen; id: string | null };

export const HOME: Route = { screen: "dashboard", id: null };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "").split("?")[0];
  if (!raw) return HOME;
  const slash = raw.indexOf("/");
  const screen = slash === -1 ? raw : raw.slice(0, slash);
  if (!(SCREENS as readonly string[]).includes(screen)) return HOME;
  const rawId = slash === -1 ? "" : raw.slice(slash + 1);
  return { screen: screen as Screen, id: decodeId(rawId) };
}

function decodeId(rawId: string): string | null {
  if (!rawId) return null;
  try {
    return decodeURIComponent(rawId) || null;
  } catch {
    return rawId;
  }
}

export function toHash(route: Route): string {
  return route.id ? `#/${route.screen}/${encodeURIComponent(route.id)}` : `#/${route.screen}`;
}

// Relaunch restore: the Tauri webview reloads on `tauri://localhost` and drops
// the fragment, so mirror it to localStorage (the same lightweight-persistence
// pattern as filingReminders / Gastos — NOT the SQLite preferences table).
const STORAGE_KEY = "automono:last-route";

// Don't restore straight into a half-filled form — a relaunch should land on a
// list/detail view, never a "new"/"edit" screen the user never saved.
const NON_RESTORABLE = new Set<Screen>([
  "cliente-nuevo",
  "cliente-editar",
  "factura-nueva",
  "factura-rectificar",
  "presupuesto-nuevo",
  "presupuesto-editar",
  "contrato-nuevo",
  "contrato-editar",
  "gasto-nuevo",
  "gasto-editar",
]);

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => {
    if (!window.location.hash) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) window.history.replaceState(null, "", saved);
    }
    return parseHash(window.location.hash);
  });

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    if (NON_RESTORABLE.has(route.screen)) return;
    localStorage.setItem(STORAGE_KEY, toHash(route));
  }, [route]);

  // Setting `location.hash` pushes a history entry, so browser/OS back/forward
  // replay it. Guard against a no-op navigation adding a duplicate entry.
  const navigate = useCallback((screen: Screen, id?: string | number | null) => {
    const next = toHash({ screen, id: id == null ? null : String(id) });
    if (next !== window.location.hash) window.location.hash = next;
  }, []);

  return { screen: route.screen, recordId: route.id, navigate };
}
