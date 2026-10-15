"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { translations } from "@/lib/translations";

const LanguageContext = createContext<{
  language: string;
  t: (text: string) => string;
  setLanguage: (value: string) => void;
}>({ language: "en", t: text => text, setLanguage: () => {} });

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage: string }) {
  const [language, updateLanguage] = useState(initialLanguage);
  const t = (text: string) => language === "zh" ? translations[text] ?? text : text;
  const setLanguage = (value: string) => {
    updateLanguage(value);
    document.cookie = `ui-language=${value}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = value;
  };
  return <LanguageContext.Provider value={{ language, t, setLanguage }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export function T({ children }: { children: string }) { return <>{useLanguage().t(children)}</>; }

export function LanguageSwitcher() {
  const { language, t, setLanguage } = useLanguage();
  return <select
    aria-label={t("Interface language")}
    value={language}
    onChange={event => setLanguage(event.target.value)}
    className="min-h-9 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent px-1 text-sm font-medium text-[#17201e] shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17201e]"
  ><option value="en">English</option><option value="zh">中文</option></select>;
}
