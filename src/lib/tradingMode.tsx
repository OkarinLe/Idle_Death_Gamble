"use client";

// Whether the home page's Trading mode toggle is on. Shared through context because
// AccessibilityBar renders once, above every page (see layout.tsx), but the toggle itself
// lives on the home page — this is how the bar finds out to switch to dark colors too.
import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = { trading: boolean; setTrading: (v: boolean) => void };
const TradingModeContext = createContext<Ctx>({ trading: false, setTrading: () => {} });

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [trading, setTrading] = useState(false);
  return <TradingModeContext.Provider value={{ trading, setTrading }}>{children}</TradingModeContext.Provider>;
}

export const useTradingMode = () => useContext(TradingModeContext);
