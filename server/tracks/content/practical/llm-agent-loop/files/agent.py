from dataclasses import dataclass, field


@dataclass
class Outcome:
    status: str                 # "done", "budget_exceeded" or "stuck"
    answer: str | None = None
    steps: int = 0
    tokens: int = 0
    trace: list = field(default_factory=list)


def run_agent(task, model, tools, budget, approve):
    messages = [{"role": "user", "content": task}]
    steps = 0
    while True:
        reply = model(messages, sorted(tools))
        steps += 1
        messages.append(reply)
        if reply.text is not None:
            return Outcome("done", reply.text, steps)
        for c in reply.tool_calls:
            result = tools[c.name].fn(**c.args)
            messages.append({"role": "tool", "name": c.name, "content": str(result)})
