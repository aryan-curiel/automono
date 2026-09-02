import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextArea } from "../components/ui/Field";
import { listExpenses } from "../db/expenses";
import type { ExpenseRecord } from "../db/expenses";
import type { InvoiceListItem } from "../db/invoices";
import { getUserContext } from "../db/userContext";
import { activeApiKey, activeModel, getLlmSettings } from "../db/llmSettings";
import type { LlmSettingsRecord } from "../db/llmSettings";
import { askAssistant, type AssistantMessage } from "../db/assistant";
import { buildAssistantContext } from "../lib/assistantContext";

interface AsistenteProps {
  invoices: InvoiceListItem[];
  onOpenSettings: () => void;
}

interface LlmState {
  settings: LlmSettingsRecord;
  apiKey: string;
}

// ponytail: conversation lives only in this component's state — no persistence in v1 (issue #37).
// Reloading the app or leaving the screen clears it. Add a `conversations` table if history matters.
export function Asistente({ invoices, onOpenSettings }: AsistenteProps) {
  const { t } = useTranslation();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [userContextMd, setUserContextMd] = useState("");
  const [llm, setLlm] = useState<LlmState | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, ctx, settings] = await Promise.all([
        listExpenses(),
        getUserContext().catch(() => ""),
        getLlmSettings().catch(() => null),
      ]);
      const apiKey = settings ? await activeApiKey(settings).catch(() => null) : null;
      if (cancelled) return;
      setExpenses(rows);
      setUserContextMd(ctx);
      setLlm(settings && apiKey ? { settings, apiKey } : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || sending || !llm) return;
    const next: AssistantMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const context = buildAssistantContext({
        invoices,
        expenses,
        userContextMd,
        todayIso: new Date().toISOString().slice(0, 10),
      });
      const reply = await askAssistant(
        context,
        next,
        llm.settings.provider,
        llm.apiKey,
        activeModel(llm.settings),
      );
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("Assistant request failed:", err);
      setError(t("assistant.error"));
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    t("assistant.suggestion1"),
    t("assistant.suggestion2"),
    t("assistant.suggestion3"),
  ];

  return (
    <div className="px-8 pb-6 h-full flex flex-col">
      <PageHeader title={t("assistant.title")} subtitle={t("assistant.subtitle")} />

      {ready && !llm && (
        <Card className="px-5 py-4 text-[13px] text-ink-soft flex items-center justify-between gap-4">
          <span>{t("assistant.noLlm")}</span>
          <Button variant="secondary" onClick={onOpenSettings}>
            {t("assistant.openSettings")}
          </Button>
        </Card>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 && ready && llm && (
          <div className="flex flex-col gap-3 py-6">
            <div className="flex items-center gap-2 text-ink-soft text-[13px]">
              <Sparkle size={16} weight="fill" className="text-accent" />
              {t("assistant.emptyHint")}
            </div>
            <div className="flex flex-col gap-2 items-start">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="text-left text-[13px] px-3 py-2 rounded-control border border-border bg-surface
                             hover:border-accent hover:text-accent transition-colors cursor-pointer
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end max-w-[80%] px-3.5 py-2.5 rounded-card bg-accent text-white text-[13px] whitespace-pre-wrap"
                  : "self-start max-w-[80%] px-3.5 py-2.5 rounded-card bg-surface border border-border text-[13px] whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="self-start text-[13px] text-ink-soft px-3.5 py-2.5">
              {t("assistant.thinking")}
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-[12px] text-danger pb-2">{error}</div>}

      <form
        className="flex gap-2 items-end pt-3 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <TextArea
          rows={2}
          value={input}
          disabled={!llm || sending}
          placeholder={t("assistant.placeholder")}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          className="flex-1 resize-none"
        />
        <Button type="submit" disabled={!llm || sending || !input.trim()}>
          <PaperPlaneRight size={16} weight="fill" />
        </Button>
      </form>
    </div>
  );
}
