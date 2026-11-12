import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chat, StreamingMarkdown, type ChatMessage } from "./Chat";
import { mdHtml } from "@/lib/lesson-md";

// jsdom has no layout: assistant-ui measures the thread for auto-scroll.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const msgs: ChatMessage[] = [
  { id: "a", role: "user", text: "Why <b>?" },
  { id: "b", role: "assistant", text: "Because **one bit** goes.\n\n- a\n- b", who: { name: "Tutor", key: "tutor" }, parts: [{ tool: "stage", args: { label: "Whiteboard" } }] },
  { id: "c", role: "note", text: "You got the activity right." },
  { id: "d", role: "assistant", text: "Pager's going.", who: { name: "Priya", key: "priya" } },
];

describe("Chat", () => {
  it("draws the turns: plain text for the learner, Markdown for replies, notes, and tool cards by name", () => {
    render(<Chat messages={msgs} running={false} tools={{ stage: (a) => <button type="button">{String(a.label)}</button> }} />);
    expect(screen.getByText("Why <b>?")).toBeInTheDocument();   // escaped, never HTML
    expect(screen.getByText("one bit").tagName).toBe("STRONG");
    expect(screen.getByText("You got the activity right.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whiteboard" })).toBeInTheDocument();
    expect(screen.queryByText("Tutor")).toBeNull();          // the plain tutor goes unnamed, as in the library's thread
    expect(screen.getByText("Priya")).toBeInTheDocument();   // a cast member is named
  });

  it("sends on Enter and puts the text back when sending fails", async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error("down"));
    render(<Chat messages={[]} running={false} onSend={onSend} label="Message" />);
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hello"));
    await waitFor(() => expect(box.value).toBe("hello"));
  });

  it("starts from a kept draft and reports edits", async () => {
    const onDraft = vi.fn();
    render(<Chat messages={[]} running={false} draft="half a thought" onDraft={onDraft} label="Message" />);
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe("half a thought"));
    fireEvent.change(box, { target: { value: "half a thought, finished" } });
    await waitFor(() => expect(onDraft).toHaveBeenLastCalledWith("half a thought, finished"));
  });

  it("shows typing while waiting, and a streaming reply in place of it", () => {
    const { rerender } = render(<Chat messages={[msgs[0]]} running typingLabel="Coach is typing" />);
    expect(screen.getByRole("status", { name: "Coach is typing" })).toBeInTheDocument();
    rerender(<Chat messages={[msgs[0], { id: "s", role: "assistant", text: "Half", streaming: true }]} running typingLabel="Coach is typing" />);
    expect(screen.queryByRole("status", { name: "Coach is typing" })).toBeNull();
    expect(screen.getByText("Half")).toBeInTheDocument();
  });
});

describe("lesson Markdown", () => {
  it("escapes, and renders a reply cut off mid-fence", () => {
    expect(mdHtml("<script>x</script>")).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
    expect(mdHtml("Code:\n```python\nx = 1")).toContain('<pre class="sd-code" data-lang="python"><code>x = 1</code></pre>');
  });

  it("fades a streaming reply in word by word, keeping the Markdown and the words already shown", () => {
    const { container, rerender } = render(<StreamingMarkdown text="Because **one bit** goes" />);
    expect(container.querySelector("strong")?.textContent).toBe("one bit");
    expect(container.textContent).toBe("Because one bit goes");
    expect(container.querySelectorAll(".ch-fade")).toHaveLength(4);   // every word is new, so all four fade in
    const delay = () => parseInt(container.querySelector<HTMLElement>(".ch-fade")!.style.animationDelay);
    const before = delay();
    rerender(<StreamingMarkdown text="Because **one bit** goes down the wire" />);
    expect(container.textContent).toBe("Because one bit goes down the wire");
    expect(container.querySelectorAll(".ch-fade").length).toBe(7);    // still fading: drawn again, not restarted
    expect(delay()).toBeLessThanOrEqual(before);   // the first word keeps its start time, it isn't restarted
  });
});
