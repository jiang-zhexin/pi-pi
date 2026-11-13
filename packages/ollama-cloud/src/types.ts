export type ListResponse = {
  models: Array<{
    name: string;
    modified_at: string;
    model: string;
    size: number;
    digest: string;
    details: ModelDetails;
    expires_at: string;
    size_vram: number;
  }>;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, choice | noul | score>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

type choice = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type noul = {
  type: "noul";
  noul: number;
};

type score = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

type ModelDetails = {
  parent_model: string;
  format: string;
  family: string;
  families: string[] | null;
  parameter_size: string;
  quantization_level: string;
};
