import ErrorBoundary from '@/components/ErrorBoundary';
import KeywordResearchClient from '@/components/KeywordResearchClient';

export default function Page() {
  return (
    <ErrorBoundary>
      <KeywordResearchClient />
    </ErrorBoundary>
  );
}
