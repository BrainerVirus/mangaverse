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

export function ErrorState({ title, message, providerName, onRetry, onBack }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {providerName && <span className="font-medium">{providerName}: </span>}
          {message}
        </AlertDescription>
      </Alert>

      <div className="mt-6 flex gap-3">
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
    </div>
  );
}