import { Type } from "typebox";

export const searchInput = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 128,
    description:
      "Supports site:, -site:, excluded terms, quoted phrases, lang:, after:, and before: operators.",
  }),
  count: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 50,
      default: 10,
      description: "The number of results to return",
    }),
  ),
  ori_question: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "The user's question that triggered the search to improve query understanding",
    }),
  ),
  localization: Type.Optional(
    Type.String({
      description: "An IP address used to localize search results.",
    }),
  ),
  need_content: Type.Optional(
    Type.Boolean({
      description: "Include full page content when available",
    }),
  ),
});

export const searchOutput = Type.Object({
  results: Type.Array(
    Type.Object({
      rerank_score: Type.Number(),
      title: Type.String(),
      url: Type.String(),
      snippet: Type.String(),
      summary: Type.String(),
      content: Type.String(),
      site_name: Type.Union([Type.String(), Type.Null()]),
      site_icon: Type.Union([Type.String(), Type.Null()]),
      date: Type.Union([Type.String(), Type.Null()]),
      authority: Type.Integer(),
    }),
  ),
});

export const fetchInput = Type.Object({
  url: Type.String({
    minLength: 1,
    maxLength: 8192,
    description: "The page URL to fetch",
  }),
});

export const fetchOutput = Type.Object({
  title: Type.String(),
  content: Type.String(),
});
