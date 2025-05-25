"""Document class module"""

class Document:
    """Document or batch of document"""

    def __init__(self, utf8_content=None, metadata=None):
        self.utf8_content=utf8_content
        self.metadata=metadata
    
    def __repr__(self):
        return self.utf8_content

    def __str__(self):
        return self.utf8_content
