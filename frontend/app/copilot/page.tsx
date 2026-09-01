"use client";

import { useState, useRef, useEffect } from "react";
import { getCustomers, copilotQuery } from "@/lib/api";
import type { CustomerResponse, CopilotResponse } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Bot, Send, User, Shield } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  groundedFields?: string[];
  mode?: string;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCustomers()
      .then((c) => {
        setCustomers(c);
        if (c.length > 0) setCustomerId(String(c[0].id));
      })
      .catch(() => {})
      .finally(() => setCustomersLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading || !customerId) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const response: CopilotResponse = await copilotQuery(Number(customerId), question);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources_referenced,
          groundedFields: response.grounded_fields,
          mode: response.mode,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: e instanceof Error ? `Error: ${e.message}` : "Something went wrong.",
          mode: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Why was this customer given this score?",
    "How much should we lend?",
    "Summarize this customer's profile",
    "Is there any fraud risk?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-400" />
            AI Risk Copilot
          </h1>
          <p className="text-slate-400 text-sm mt-1">Ask questions about a customer&apos;s risk profile</p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")} disabled={customersLoading}>
            <SelectTrigger className="bg-navy-800 border-navy-600 text-white">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent className="bg-navy-800 border-navy-600">
              {customers.map((c) => (
                <SelectItem
                  key={c.id}
                  value={String(c.id)}
                  className="text-white focus:bg-navy-700 focus:text-white"
                >
                  {c.name} (#{c.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AlertBanner />

      <Card className="flex-1 overflow-hidden bg-navy-900 border-navy-700 flex flex-col">
        <CardContent className="flex-1 p-0 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 mt-20">
                  <Bot className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                  <p className="text-lg mb-4">Ask about a customer&apos;s risk profile</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {suggestions.map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        onClick={() => setInput(q)}
                        className="border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white"
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-navy-800 border border-navy-600 text-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.role === "user" ? (
                        <User className="w-3 h-3" />
                      ) : (
                        <Bot className="w-3 h-3" />
                      )}
                      <span className="text-[10px] uppercase tracking-wider opacity-70">
                        {msg.role === "user" ? "You" : "Copilot"}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "assistant" && msg.mode && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <DataSourceBadge mode={msg.mode} />
                        {msg.groundedFields && msg.groundedFields.length > 0 && (
                          <Badge variant="outline" className="border-navy-600 text-slate-400 text-[10px]">
                            Grounded on: {msg.groundedFields.join(", ")}
                          </Badge>
                        )}
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-navy-600">
                        <p className="text-xs text-slate-400">
                          Sources: {msg.sources.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-navy-800 border border-navy-600 rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-navy-700 flex gap-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask about this customer's risk profile..."
              className="flex-1 bg-navy-800 border-navy-600 text-white placeholder-slate-500 focus-visible:ring-blue-500"
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim() || !customerId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertBanner() {
  return (
    <div className="mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-start gap-3">
      <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="text-sm text-amber-200">
        <span className="font-semibold">Non-decision assistant.</span> The copilot explains risk
        but cannot approve, decline, or set loan terms. Always verify against the formal
        assessment.
      </div>
    </div>
  );
}
