# Backend/models.py

from pydantic import BaseModel, Field
from typing import List
from pydantic import BaseModel
from typing import List, Optional, Any, Dict

class Citation(BaseModel):
    id: str              # e.g. [Doc-1], [Graph-1], [Web-1]
    type: str            # "text", "graph", "web"
    content: str         # The snippet
    source_file: Optional[str] = None 
    metadata: Optional[Dict] = None

class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation] 

class ChatRequestBody(BaseModel):
    query: str  
    useHybrid: bool = True

class Node(BaseModel):
    id: str
    type: str

class Relationship(BaseModel):
    source: str
    target: str
    type: str

class KnowledgeGraphResponse(BaseModel):
    """The internal structure for a generated knowledge graph."""
    nodes: List[Node]
    relationships: List[Relationship]

class GraphGenerationResponse(BaseModel):
    """
    The final API response for a graph request, containing the
    HTML content for live display and a data URL for downloading.
    """
    html_content: str
    download_url: str

# --- Chat Agent Models ---

class Source(BaseModel):
    """A single source document used to answer a question."""
    title: str
    link: str
    snippet: str

class ChatRequestBody(BaseModel):
    """Request body for the chat agent."""
    query: str = Field(..., min_length=1, description="User's question about Entegris.")

class ChatResponse(BaseModel):
    """Response body for the chat agent, including sources."""
    answer: str
    sources: List[Source] = []

# --- General Request Models ---

class TextRequestBody(BaseModel):
    """Request body for generating a graph from a block of text."""
    text: str = Field(..., min_length=20, description="Text content to build the graph from.")



class ExperimentRequestBody(BaseModel):
    path_string: str = Field(..., description="The 'A -> B -> C' path string.")
    document_id: str = Field(..., description="The ID (e.g., filename) of the source document.")

class ExperimentResponse(BaseModel):
    path_string: str
    prompt: str
    llm_response: str
    parsed_json: dict