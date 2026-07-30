import ErrorBoundary from '@/components/ErrorBoundary';
import KeywordResearchApp from '@/components/KeywordResearchApp';

export default function Page() {
  return (
    <ErrorBoundary>
      <KeywordResearchApp />
    </ErrorBoundary>
  );
}
