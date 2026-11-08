from agent import run_agent
from fake_model import Budget, ScriptedModel, Tool, answer, call, tool_results

ORDERS = {"A1": "shipped", "A2": "delayed"}
refunded = []
TOOLS = {
    "get_order": Tool(lambda order_id: ORDERS[order_id], required=("order_id",)),
    "refund": Tool(lambda order_id: refunded.append(order_id) or "refunded", required=("order_id",), risky=True),
}
YES = lambda name, args: True
NO = lambda name, args: False


def test_answers_directly():
    out = run_agent("hi", ScriptedModel(answer("Hello!")), TOOLS, Budget(), YES)
    assert (out.status, out.answer, out.steps) == ("done", "Hello!", 1)


def test_tool_result_goes_back_to_the_model():
    m = ScriptedModel(call("get_order", order_id="A2"), answer("It's delayed."))
    out = run_agent("where is A2?", m, TOOLS, Budget(), YES)
    assert out.status == "done" and tool_results(m.seen[1]) == ["delayed"]
    assert out.trace == [{"step": 1, "tool": "get_order", "args": {"order_id": "A2"}, "ok": True}]


def test_unknown_tool_is_an_error_message_not_a_crash():
    m = ScriptedModel(call("get_ordr", order_id="A1"), answer("Sorry."))
    run_agent("x", m, TOOLS, Budget(), YES)
    assert tool_results(m.seen[1]) == ["unknown tool get_ordr; available: get_order, refund"]


def test_missing_argument_and_tool_exceptions():
    m = ScriptedModel(call("get_order"), call("get_order", order_id="ZZ"), answer("Done."))
    out = run_agent("x", m, TOOLS, Budget(), YES)
    results = tool_results(m.seen[2])
    assert results[0] == "missing argument: order_id"
    assert results[1].startswith("error:") and "ZZ" in results[1]
    assert [t["ok"] for t in out.trace] == [False, False]


def test_denied_risky_call_is_not_executed():
    refunded.clear()
    m = ScriptedModel(call("refund", order_id="A1"), answer("I couldn't refund it."))
    run_agent("refund A1", m, TOOLS, Budget(), NO)
    assert refunded == [] and tool_results(m.seen[1]) == ["denied by the user"]


def test_step_budget():
    m = ScriptedModel(*[call("get_order", order_id=k) for k in ["A1", "A2"] * 5])
    out = run_agent("loop", m, TOOLS, Budget(max_steps=4), YES)
    assert out.status == "budget_exceeded" and out.steps == 4


def test_token_budget():
    m = ScriptedModel(call("get_order", tokens=600, order_id="A1"), call("get_order", tokens=600, order_id="A2"),
                      answer("never reached"))
    out = run_agent("x", m, TOOLS, Budget(max_tokens=1000), YES)
    assert out.status == "budget_exceeded" and out.tokens == 1200 and out.steps == 2
