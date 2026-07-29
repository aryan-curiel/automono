import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import commonEs from "../locales/es/common.json";
import commonEn from "../locales/en/common.json";

void i18n.use(initReactI18next).init({
  resources: { es: { common: commonEs }, en: { common: commonEn } },
  lng: "es",
  fallbackLng: "es",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
