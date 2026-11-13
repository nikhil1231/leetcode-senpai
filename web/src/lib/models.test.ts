import { describe, expect, it } from "vitest";
import { modelName } from "./models";

describe("modelName", () => {
  it("says a model the way people do", () => {
    expect(modelName("anthropic/claude-sonnet-5.5")).toBe("Sonnet 5.5");
    expect(modelName("openai/gpt-6.1-terra")).toBe("GPT-6.1 Terra");
    expect(modelName("deepseek/deepseek-v4.1-flash")).toBe("Deepseek v4.1 Flash");
    expect(modelName("elevenlabs/scribe-v2")).toBe("Scribe v2");
    expect(modelName(undefined)).toBe("");
  });
});
