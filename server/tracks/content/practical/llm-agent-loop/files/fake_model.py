"""Message types and a scripted model for testing an agent loop without a real model."""
from dataclasses import dataclass, field


@dataclass
class ToolCall:
    name: str
    args: dict = field(default_factory=dict)


@dataclass
class Reply:
    tool_calls: list = field(default_factory=list)
    text: str | None = None
    tokens: int = 100


@dataclass
class Tool:
    fn: object
    required: tuple = ()
    risky: bool = False


@dataclass
class Budget:
    max_steps: int = 10
    max_tokens: int = 10_000


def call(name, tokens=100, **args):
    return Reply(tool_calls=[ToolCall(name, args)], tokens=tokens)


def answer(text, tokens=100):
    return Reply(text=text, tokens=tokens)


class ScriptedModel:
    """Returns the scripted replies in order, and records the messages it was shown each time."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.seen = []

    def __call__(self, messages, specs):
        self.seen.append([dict(m) if isinstance(m, dict) else m for m in messages])
        if not self.replies:
            raise AssertionError(f"the model was called {len(self.seen)} times, more than scripted")
        return self.replies.pop(0)


def tool_results(messages):
    return [m["content"] for m in messages if isinstance(m, dict) and m.get("role") == "tool"]
