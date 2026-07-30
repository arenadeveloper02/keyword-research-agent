"use client"

// The "SEMrush units" widget at the top was removed per request. The component
// is kept (with the same props contract) so existing imports and JSX usage in
// KeywordResearchClient continue to compile — it now renders nothing.
interface SemrushBalanceWidgetProps {
  refreshSignal: number;
}

export default function SemrushBalanceWidget(_props: SemrushBalanceWidgetProps) {
  return null;
}
