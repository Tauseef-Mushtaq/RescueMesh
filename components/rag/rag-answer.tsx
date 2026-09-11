import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface RagAnswerProps {
  answer: string;
  knowledgeFound: boolean;
}

const DISCLAIMER =
  "Use this information as emergency guidance and follow instructions from local emergency authorities when available.";

/**
 * Renders the grounded answer text plus a trust indicator. The
 * "Grounded in RescueMesh knowledge" badge only appears when the API
 * itself reported `knowledgeFound: true` — never shown alongside the
 * no-knowledge fallback answer, so it can never imply more confidence
 * than the backend actually has.
 */
export function RagAnswer({ answer, knowledgeFound }: RagAnswerProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
        {knowledgeFound && (
          <Badge variant="success" className="w-fit">
            Grounded in RescueMesh knowledge
          </Badge>
        )}

        <p className="whitespace-pre-line text-base leading-relaxed text-foreground">
          {answer}
        </p>

        <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
      </CardContent>
    </Card>
  );
}
