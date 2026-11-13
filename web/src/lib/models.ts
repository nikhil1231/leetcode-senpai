/** A model ID as people say it: "anthropic/claude-sonnet-5.5" -> "Sonnet 5.5", "openai/gpt-6.1-terra" -> "GPT-6.1 Terra". */
export function modelName(id: string | undefined | null): string {
  if (!id) return "";
  const tail = id.replace(/^~/, "").split("/").pop() || id;
  const words = tail.replace(/^claude-/, "").split("-");
  return words
    .map((w, i) => (/^gpt$/i.test(w) ? "GPT" : i === 0 || /^[a-z]/.test(w) && !/^v?\d/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/^GPT (\d)/, "GPT-$1");
}
