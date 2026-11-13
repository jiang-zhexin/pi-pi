import type {
  ClassifierAnswer,
  ClassifierApi,
  ClassifierContext,
  ClassifierModel,
  ClassifierOptions,
  ClassifierResult,
} from "@earendil-works/pi-ai";

export async function classify(
  model: ClassifierModel<ClassifierApi>,
  context: ClassifierContext,
  options?: ClassifierOptions,
): Promise<ClassifierResult> {
  const fetcher = options?.fetch ?? globalThis.fetch;

  const resp = await fetcher(new URL("/open/api/v1/systemone", model.baseUrl), {
    method: "POST",
    body: JSON.stringify({
      model: model.id,
      state: context.state,
      questions: Object.fromEntries(
        Object.entries(context.questions).map(([key, question]) => [
          key,
          { ...question, type: question.type === "bool" ? "noul" : question.type },
        ]),
      ),
      images: context.images?.map((img) => `data:${img.mimeType};base64,${img.data}`),
    }),
    headers: {
      Authorization: `Bearer ${options?.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options?.signal ?? null,
  });

  if (!resp.ok) {
    const detail = (await resp.text().catch(() => "")) || resp.statusText;
    return {
      stopReason: "error",
      api: model.api,
      model: model.id,
      provider: model.provider,
      timestamp: Date.now(),
      errorMessage:
        resp.status === 401
          ? "Unauthorized. Run `/login ecnu` to authenticate and ensure access to ecnu-decision."
          : `ECNU Classify API error (status ${resp.status}): ${detail}`,
      answers: {},
    };
  }

  const classifyResp = (await resp.json()) as SystemOneResponse;

  return {
    stopReason: "stop",
    api: model.api,
    model: model.id,
    provider: model.provider,
    timestamp: Date.now(),
    answers: Object.fromEntries(
      Object.entries(classifyResp.answers).map(([key, answer]) => [key, convertAnswer(answer)]),
    ),
    usage: {
      output: classifyResp.usage.output_tokens,
      input: classifyResp.usage.input_tokens,
      totalTokens: classifyResp.usage.output_tokens + classifyResp.usage.input_tokens,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
    },
  };
}

function convertAnswer(answer: SystemOneResponse["answers"][string]): ClassifierAnswer {
  switch (answer.type) {
    case "choice":
      return {
        type: "choice",
        choice: answer.choice,
        probabilities: answer.probabilities,
        confidence: answer.confidence,
      };

    case "score":
      return {
        type: "score",
        score: answer.score,
        confidence: answer.confidence,
      };

    case "noul":
      return {
        type: "bool",
        probability: answer.noul,
      };
  }
}

type SystemOneResponse = {
  answers: Record<
    string,
    | {
        type: "choice";
        choice: string;
        probabilities: Record<string, number>;
        confidence: number;
      }
    | {
        type: "score";
        score: number;
        confidence: number;
      }
    | {
        type: "noul";
        noul: number;
      }
  >;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};
