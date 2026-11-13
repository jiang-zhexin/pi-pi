import { Type } from "typebox";

export const searchInput = Type.Object({
  query: Type.String({
    minLength: 1,
    description: "the search query string",
  }),
  max_results: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 10,
      default: 5,
      description: "maximum results to return",
    }),
  ),
});

export const searchOutput = Type.Object({
  results: Type.Array(
    Type.Object({
      title: Type.String(),
      url: Type.String(),
      content: Type.String(),
    }),
  ),
});

export const fetchInput = Type.Object({
  url: Type.String({
    minLength: 1,
    description: "the URL to fetch",
  }),
});

export const fetchOutput = Type.Object({
  title: Type.String(),
  content: Type.String(),
  links: Type.Array(Type.String()),
});
