import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { classify } from "./classify.ts";
import { generateImages } from "./images.ts";
import { models } from "./model.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerProvider("ecnu", {
    name: "ECNU Chat",
    baseUrl: "https://chat.ecnu.edu.cn/open/api/v1",
    apiKey: "$ECNU_API_KEY",
    api: "openai-completions",
    models,
    images: { "ecnu-images": { generateImages } },
    classifiers: { "ecnu-decision": { classify } },
  });
}
