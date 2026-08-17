import { useState } from "react";
import type { Mode } from "./api";
import Chat from "./tabs/Chat";
import Audit from "./tabs/Audit";
import Traffic from "./tabs/Traffic";
import Guardrails from "./tabs/Guardrails";
import Overview from "./tabs/Overview";
import Usage from "./tabs/Usage";

const TABS = [
  { id: "overview", label: "概要", icon: "🗺️" },
  { id: "chat", label: "チャット", icon: "💬" },
  { id: "audit", label: "監査ログ", icon: "📋" },
  { id: "traffic", label: "トラフィック制御", icon: "🚦" },
  { id: "guardrails", label: "入出力管理", icon: "🛡️" },
  { id: "usage", label: "使用状況", icon: "📊" },
] as const;

export default function App() {
  const [tab, setTab] = useState<string>("overview");
  const [mode, setMode] = useState<Mode>("nogw");
  const on = mode === "withgw";

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <h1>Unity AI Gateway ガバナンスデモ</h1>
            <p className="sub">カスタマーサポートAI — ガバナンスの有無を切り替えて比較</p>
          </div>
        </div>

        <div className={`gw-toggle ${on ? "on" : "off"}`}>
          <div className="gw-label">
            <span className="gw-title">AI Gateway</span>
            <span className="gw-state">{on ? "有効 (ガバナンスあり)" : "無効 (ガバナンスなし)"}</span>
          </div>
          <button
            className={`switch ${on ? "on" : "off"}`}
            onClick={() => setMode(on ? "nogw" : "withgw")}
            aria-label="toggle gateway"
          >
            <span className="knob" />
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === "chat" && <Chat mode={mode} setMode={setMode} />}
        {tab === "audit" && <Audit mode={mode} />}
        {tab === "traffic" && <Traffic mode={mode} setMode={setMode} />}
        {tab === "guardrails" && <Guardrails />}
        {tab === "overview" && <Overview />}
        {tab === "usage" && <Usage />}
      </main>
    </div>
  );
}
