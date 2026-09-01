import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message: string;
  retry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-slate-400 text-sm max-w-sm mb-4">{message}</p>
      {retry && (
        <Button
          onClick={retry}
          variant="outline"
          className="border-navy-600 text-slate-300 hover:bg-navy-800 hover:text-white"
        >
          Try again
        </Button>
      )}
    </div>
  );
}
