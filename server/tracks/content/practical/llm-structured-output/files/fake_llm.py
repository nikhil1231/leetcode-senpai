"""A scripted stand-in for a model: returns the given replies in order and records every prompt."""


class ScriptedModel:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.prompts = []

    def __call__(self, prompt):
        self.prompts.append(prompt)
        if not self.replies:
            raise AssertionError(f"the model was called {len(self.prompts)} times, more than scripted")
        return self.replies.pop(0)
