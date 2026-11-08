from dataclasses import dataclass, field


@dataclass
class Outcome:
    status: str                 # "done", "budget_exceeded" or "stuck"
    answer: str | None = None
    steps: int = 0
    tokens: int = 0
    trace: list = field(default_factory=list)


def _run_tool(call, tools, approve):
    """-> (result text, ok). Problems become messages the model can act on."""
    tool = tools.get(call.name)
    if tool is None:
        return f"unknown tool {call.name}; available: {', '.join(sorted(tools))}", False
    for name in tool.required:
        if name not in call.args:
            return f"missing argument: {name}", False
    if tool.risky and not approve(call.name, dict(call.args)):
        return "denied by the user", False
    try:
        return str(tool.fn(**call.args)), True
    except Exception as exc:
        return f"error: {exc}", False


def run_agent(task, model, tools, budget, approve):
    messages = [{"role": "user", "content": task}]
    out = Outcome("budget_exceeded")
    recent = []
    while out.steps < budget.max_steps:
        reply = model(messages, sorted(tools))
        out.steps += 1
        out.tokens += reply.tokens
        messages.append(reply)
        if out.tokens > budget.max_tokens:
            return out
        if reply.text is not None and not reply.tool_calls:
            out.status, out.answer = "done", reply.text
            return out
        for call in reply.tool_calls:
            recent = (recent + [(call.name, sorted(call.args.items()))])[-3:]
            result, ok = _run_tool(call, tools, approve)
            out.trace.append({"step": out.steps, "tool": call.name, "args": dict(call.args), "ok": ok})
            messages.append({"role": "tool", "name": call.name, "content": result})
            if len(recent) == 3 and recent[0] == recent[1] == recent[2]:
                out.status = "stuck"
                return out
    return out
