import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import {
  House,
  UsersThree,
  Receipt,
  FileText,
  HandCoins,
  Bank,
  Wallet,
  Tray,
  ChartPieSlice,
  ClipboardText,
  Sparkle,
  GearSix,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { getBusinessProfile } from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import type { Screen } from "../types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0].toUpperCase()).join("") || "—";
}

const NAV_ITEMS: { id: Screen; labelKey: string; icon: PhosphorIcon }[] = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: House },
  { id: "clientes", labelKey: "nav.clients", icon: UsersThree },
  { id: "facturas", labelKey: "nav.invoices", icon: Receipt },
  { id: "presupuestos", labelKey: "nav.quotes", icon: FileText },
  { id: "cobros", labelKey: "nav.collections", icon: HandCoins },
  { id: "conciliacion", labelKey: "nav.reconciliation", icon: Bank },
  { id: "gastos", labelKey: "nav.expenses", icon: Wallet },
  { id: "bandeja", labelKey: "nav.receiptInbox", icon: Tray },
  { id: "resumen-trimestral", labelKey: "nav.quarterlySummary", icon: ChartPieSlice },
  { id: "resumen-anual", labelKey: "nav.annualSummary", icon: ClipboardText },
  { id: "asistente", labelKey: "nav.assistant", icon: Sparkle },
];

const GROUPED_SCREENS: Partial<Record<Screen, Screen>> = {
  facturas: "facturas",
  "factura-nueva": "facturas",
  "factura-detalle": "facturas",
  "factura-rectificar": "facturas",
  presupuestos: "presupuestos",
  "presupuesto-nuevo": "presupuestos",
  "presupuesto-editar": "presupuestos",
  gastos: "gastos",
  "gasto-nuevo": "gastos",
  "gasto-editar": "gastos",
  "gasto-detalle": "gastos",
};

interface SidebarProps {
  screen: Screen;
  receiptInboxCount: number;
  onNavigate: (screen: Screen) => void;
}

export function Sidebar({ screen, receiptInboxCount, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const activeGroup = GROUPED_SCREENS[screen] ?? screen;
  const [profile, setProfile] = useState<BusinessProfileRecord | null>(null);
  const reduceMotion = useReducedMotion();

  // ponytail: re-fetches on every screen change (cheap local query) instead of a
  // shared store, so the footer picks up Ajustes saves as soon as you navigate.
  useEffect(() => {
    let cancelled = false;
    void getBusinessProfile().then((p) => {
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
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
              className="relative w-full text-left text-[13px] px-3 py-2 bg-transparent border-none cursor-pointer
                         rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {active && (
                <motion.div
                  layoutId="sidebar-selection"
                  className="absolute inset-0 rounded-control bg-sidebar-selection"
                  transition={
                    reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }
                  }
                />
              )}
              <div
                className={`relative z-10 flex items-center gap-2.5 w-full ${
                  active
                    ? "font-semibold text-white"
                    : "font-medium text-sidebar-text hover:text-white"
                }`}
              >
                <Icon size={18} weight="regular" />
                {t(item.labelKey)}
                {item.id === "bandeja" && receiptInboxCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-semibold flex items-center justify-center">
                    {receiptInboxCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 p-2.5 bg-sidebar-bg-alt rounded-control mt-2">
        <div className="w-[30px] h-[30px] rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0">
          {initials(profile?.name ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[12.5px] text-white whitespace-nowrap overflow-hidden text-ellipsis">
            {profile?.name || t("nav.noData")}
          </div>
          <div className="text-[11px] text-sidebar-text whitespace-nowrap overflow-hidden text-ellipsis">
            {profile?.nifCif || ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("ajustes")}
          aria-current={activeGroup === "ajustes" ? "page" : undefined}
          aria-label={t("nav.settings")}
          className={`p-1.5 rounded-control shrink-0 cursor-pointer border-none
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                       activeGroup === "ajustes"
                         ? "bg-sidebar-selection text-white"
                         : "bg-transparent text-sidebar-text hover:bg-white/10 hover:text-white"
                     }`}
        >
          <GearSix size={16} weight="regular" />
        </button>
      </div>
    </div>
  );
}
