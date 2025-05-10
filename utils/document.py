"""Document class module"""

class Document:
    """Document or batch of document"""

    def __init__(self, utf8_content=None, metadata=None):
        self.utf8_content=utf8_content
        self.metadata=metadata
