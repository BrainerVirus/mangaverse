import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Button } from './ui/button.js';

export interface ErrorStateProps {
  title: string;
  message: string;
  providerName?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

/**
 * The alert is the state's panel: its destructive border and tint are the only chrome,
 * so a second bordered wrapper would draw the same grouping twice (docs/Design.md
 * "Cards", DESIGN.md §7.8).
 */
export function ErrorState({ title, message, providerName, onRetry, onBack }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12">
      <Alert variant="destructive" className="max-w-lg p-6">
        <AlertTriangle />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          {providerName && <span className="font-medium text-foreground">{providerName}: </span>}
          {message}
        </AlertDescription>

        {(onBack || onRetry) && (
          <div className="mt-6 flex justify-end gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft />
                Go Back
              </Button>
            )}
            {onRetry && (
              <Button onClick={onRetry}>
                <RefreshCw />
                Retry
              </Button>
            )}
          </div>
        )}
      </Alert>
    </div>
  );
}
