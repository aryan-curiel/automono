import { useEffect, useState } from "react";
import { motion } from "motion/react";
import * as Switch from "@radix-ui/react-switch";
import {
  House,
  UsersThree,
  Receipt,
  FileText,
  Wallet,
  ChartPieSlice,
  GearSix,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { getBusinessProfile } from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import type { Screen } from "../types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]!.toUpperCase()).join("") || "—";
}

const NAV_ITEMS: { id: Screen; label: string; icon: PhosphorIcon }[] = [
  { id: "dashboard", label: "Resumen", icon: House },
  { id: "clientes", label: "Clientes", icon: UsersThree },
  { id: "facturas", label: "Facturas", icon: Receipt },
  { id: "contratos", label: "Contratos", icon: FileText },
  { id: "gastos", label: "Gastos", icon: Wallet },
  { id: "resumen-trimestral", label: "Resumen trimestral", icon: ChartPieSlice },
  { id: "ajustes", label: "Ajustes", icon: GearSix },
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
    <div className="w-[230px] shrink-0 bg-sidebar-bg flex flex-col p-3 box-border border-r border-white/[0.04] dark:border-white/[0.03]">
      <div data-tauri-drag-region className="h-13 shrink-0" />
      <div className="flex items-center gap-2.5 px-2.5 pb-5.5">
        <img src="/logo.svg" alt="" className="w-6.5 h-6.5 rounded-md shrink-0" />
        <div className="font-bold text-sm text-white tracking-tight">AutoMono</div>
      </div>

      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = activeGroup === item.id;
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="relative text-[13px] px-3 py-2 cursor-pointer"
            >
              {active && (
                <motion.div
                  layoutId="sidebar-selection"
                  className="absolute inset-0 rounded-control bg-sidebar-selection"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <div
                className={`relative z-10 flex items-center gap-2.5 ${
                  active ? "font-semibold text-white" : "font-medium text-sidebar-text hover:text-white"
                }`}
              >
                <Icon size={18} weight="regular" />
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center justify-between px-2.5 py-2 border-t border-sidebar-border mt-2 mb-2">
        <span className="font-medium text-xs text-sidebar-text">Modo oscuro</span>
        <Switch.Root
          checked={theme === "dark"}
          onCheckedChange={onToggleTheme}
          className="w-9 h-5 rounded-pill relative bg-[#3a4454] data-[state=checked]:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
      </div>

      <div className="flex items-center gap-2.5 p-2.5 bg-sidebar-bg-alt rounded-control">
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
