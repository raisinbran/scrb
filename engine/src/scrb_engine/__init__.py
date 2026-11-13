"""Meeting Scribe's speech engine, a worker that speaks JSON lines.

Read ``main.Worker`` first for the protocol ops, then ``models.fetch`` for
how a model's files reach the models folder.
"""


class EngineError(Exception):
    """A failure that the worker reports with one of the protocol's codes."""

    def __init__(self, code: str, message: str) -> None:
        """Keep ``code``, such as ``model_missing``, beside the message."""
        super().__init__(message)
        self.code = code
        self.message = message
