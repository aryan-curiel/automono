import { useEffect, useState } from "react";
import { getBusinessProfile } from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import type { Screen } from "../types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]!.toUpperCase()).join("") || "—";
}

const NAV_ITEMS: { id: Screen; label: string }[] = [
  { id: "dashboard", label: "Resumen" },
  { id: "clientes", label: "Clientes" },
  { id: "facturas", label: "Facturas" },
  { id: "contratos", label: "Contratos" },
  { id: "gastos", label: "Gastos" },
  { id: "resumen-trimestral", label: "Resumen trimestral" },
  { id: "ajustes", label: "Ajustes" },
];

const GROUPED_SCREENS: Partial<Record<Screen, Screen>> = {
  facturas: "facturas",
  "factura-nueva": "facturas",
  "factura-detalle": "facturas",
  "factura-rectificar": "facturas",
  contratos: "contratos",
  "contrato-nuevo": "contratos",
  "contrato-editar": "contratos",
  "contrato-detalle": "contratos",
  gastos: "gastos",
  "gasto-nuevo": "gastos",
  "gasto-editar": "gastos",
  "gasto-detalle": "gastos",
};

interface SidebarProps {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Sidebar({ screen, onNavigate, theme, onToggleTheme }: SidebarProps) {
  const activeGroup = GROUPED_SCREENS[screen] ?? screen;
  const [profile, setProfile] = useState<BusinessProfileRecord | null>(null);

  // ponytail: re-fetches on every screen change (cheap local query) instead of a
  // shared store, so the footer picks up Ajustes saves as soon as you navigate.
  useEffect(() => {
    let cancelled = false;
    getBusinessProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  return (
    <div className="w-[230px] shrink-0 bg-sidebar-bg flex flex-col p-3.5 box-border">
      <div data-tauri-drag-region className="h-13 shrink-0" />
      <div className="flex items-center gap-2.5 px-2.5 pb-5.5">
        <img src="/logo.svg" alt="" className="w-6.5 h-6.5 rounded-md shrink-0" />
        <div className="font-bold text-sm text-white tracking-tight">AutoMono</div>
      </div>

      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = activeGroup === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`text-[13.5px] rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                active
                  ? "font-bold text-white bg-accent"
                  : "font-medium text-sidebar-text hover:bg-sidebar-bg-alt"
              }`}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center justify-between px-2.5 py-2.5 border-t border-sidebar-border mb-2.5">
        <span className="font-semibold text-xs text-sidebar-text">Modo oscuro</span>
        <div
          onClick={onToggleTheme}
          className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
            theme === "dark" ? "bg-accent" : "bg-[#3a4454]"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-[left] ${
              theme === "dark" ? "left-[18px]" : "left-0.5"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5 p-2.5 bg-sidebar-bg-alt rounded-lg">
        <div className="w-[30px] h-[30px] rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0">
          {initials(profile?.name ?? "")}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[12.5px] text-white whitespace-nowrap overflow-hidden text-ellipsis">
            {profile?.name || "Sin datos"}
          </div>
          <div className="text-[11px] text-sidebar-text whitespace-nowrap overflow-hidden text-ellipsis">
            {profile?.nifCif || ""}
          </div>
        </div>
      </div>
    </div>
  );
}
