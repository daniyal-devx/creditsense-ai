"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { legacyLogin } from "@/lib/api";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const demoAccounts = [
  { label: "Admin", email: "admin@creditsense.ai", password: "admin123" },
  { label: "Loan Officer", email: "officer@creditsense.ai", password: "officer123" },
  { label: "Risk Manager", email: "risk@creditsense.ai", password: "risk123" },
  { label: "Fraud Analyst", email: "fraud@creditsense.ai", password: "fraud123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<number | null>(null);

  function fillPersona(index: number) {
    setEmail(demoAccounts[index].email);
    setPassword(demoAccounts[index].password);
    setSelectedPersona(index);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let signedInWithSupabase = false;
      try {
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        signedInWithSupabase = !signInError;
      } catch {
        signedInWithSupabase = false;
      }

      if (!signedInWithSupabase) {
        await legacyLogin(email, password);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sign in failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            CreditSense <span className="text-primary">AI</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Risk Intelligence Platform
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Pick a demo persona below, or use your own credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Demo personas
              </p>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((account, index) => (
                  <button
                    key={account.email}
                    type="button"
                    aria-pressed={selectedPersona === index}
                    onClick={() => fillPersona(index)}
                    className={cn(
                      "rounded-lg border border-border bg-transparent px-3 py-2 text-left transition-colors",
                      "hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      "aria-pressed:border-primary/60 aria-pressed:bg-primary/10"
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {account.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {account.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
