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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Bot, Send, Shield, User } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  groundedFields?: string[];
  mode?: string;
  error?: string | null;
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
          error: response.error,
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
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
      <PageHeader
        title="AI Risk Copilot"
        description="Ask questions about a customer's risk profile"
      >
        <div className="w-full sm:w-64">
          <Select
            value={customerId}
            onValueChange={(v) => setCustomerId(v ?? "")}
            disabled={customersLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} (#{c.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <Alert className="border-border/60">
        <Shield className="size-4 text-muted-foreground" />
        <AlertDescription className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Non-decision assistant.</span>{" "}
          The copilot explains risk but cannot approve, decline, or set loan terms.
          Always verify against the formal assessment.
        </AlertDescription>
      </Alert>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="mt-16 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                    <Bot className="size-6 text-muted-foreground" />
                  </div>
                  <p className="mb-4 text-sm font-medium text-foreground">
                    Ask about a customer's risk profile
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        onClick={() => setInput(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-foreground text-background"
                        : "border border-border bg-muted/40 text-foreground"
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {msg.role === "user" ? (
                        <User className="size-3" />
                      ) : (
                        <Bot className="size-3" />
                      )}
                      <span className="text-[10px] uppercase tracking-wider opacity-70">
                        {msg.role === "user" ? "You" : "Copilot"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    {msg.role === "assistant" && msg.mode && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <DataSourceBadge mode={msg.mode} />
                        {msg.groundedFields && msg.groundedFields.length > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            Grounded on: {msg.groundedFields.join(", ")}
                          </Badge>
                        )}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.error && (
                      <div className="mt-2 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                        LLM offline: {msg.error}
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 border-t border-border/60 pt-2">
                        <p className="text-xs text-muted-foreground">
                          Sources: {msg.sources.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <div className="flex gap-1">
                      <div
                        className="size-2 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="size-2 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="size-2 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="flex gap-2 border-t border-border p-4">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask about this customer's risk profile..."
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim() || !customerId}
            >
              <Send className="mr-2 size-4" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
