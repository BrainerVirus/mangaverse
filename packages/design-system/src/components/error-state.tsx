import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/cn.js';

export interface ErrorStateProps {
  title: string;
  message: string;
  providerName?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export function ErrorState({ title, message, providerName, onRetry, onBack }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12">
      <div className={cn('surface-panel w-full max-w-lg p-6')}>
        <Alert variant="destructive" className="border-none bg-destructive/10 text-foreground shadow-none">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-base font-semibold">{title}</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            {providerName && <span className="font-medium text-foreground">{providerName}: </span>}
            {message}
          </AlertDescription>
        </Alert>

        {(onBack || onRetry) && (
          <div className="mt-6 flex justify-end gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            )}
            {onRetry && (
              <Button onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
