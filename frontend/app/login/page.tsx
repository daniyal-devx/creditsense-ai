"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { legacyLogin } from "@/lib/api";
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
    <div className="flex items-center justify-center min-h-screen w-full -ml-64">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            CreditSense <span className="text-blue-400">AI</span>
          </h1>
          <p className="text-slate-400 mt-2">Risk Intelligence Platform</p>
        </div>

        <Card className="bg-navy-900 border-navy-700">
          <CardHeader>
            <CardTitle className="text-white">Sign In</CardTitle>
            <CardDescription className="text-slate-400">
              Supabase Auth with local dev fallback
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert
                  variant="destructive"
                  className="bg-red-500/10 border-red-500/30 text-red-300"
                >
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-navy-800 border-navy-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-navy-800 border-navy-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6">
              <p className="text-xs text-slate-500 mb-2">Demo quick-fill</p>
              <div className="flex flex-wrap gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs border transition-colors",
                      "bg-navy-800 border-navy-600 text-slate-300 hover:bg-navy-700 hover:text-white"
                    )}
                  >
                    {account.label}
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
