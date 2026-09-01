"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Shield } from "lucide-react";

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-slate-400" />
          Audit Log
        </h1>
        <p className="text-slate-400 text-sm mt-1">System events and user actions</p>
      </div>

      <Card className="bg-navy-900 border-navy-700">
        <CardHeader>
          <CardTitle className="text-white">Audit Events</CardTitle>
          <CardDescription className="text-slate-400">
            Immutable record of decisions, logins, and data changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">Audit log integration pending</h3>
            <p className="text-slate-400 text-sm max-w-md mb-6">
              The audit log table and API endpoint will be added once the Supabase schema migration
              (Wave 2) is complete. This page is a placeholder for the RBAC-protected audit view.
            </p>
            <Button variant="outline" className="border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white" disabled>
              Export Audit Log
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
