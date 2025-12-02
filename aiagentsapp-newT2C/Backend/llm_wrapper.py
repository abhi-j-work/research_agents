# llm_wrapper.py — using Groq Chat API safely
import os
from groq import Groq
from dotenv import load_dotenv # Corrected import pattern

# Load environment variables from a .env file in your project root
load_dotenv()

# --- CORRECTED API KEY HANDLING ---
# 1. Fetch the API key from the environment variables
api_key = os.getenv("GROQ_API_KEY")

# 2. Add a crucial check to ensure the API key was found.
#    This prevents the app from crashing and gives a clear error message.
if not api_key:
    raise ValueError("GROQ_API_KEY not found in environment variables. Please create a .env file and add GROQ_API_KEY='your-key'")

# 3. Initialize the Groq client once with the loaded key.
groq_client = Groq(api_key=api_key)


# Default Groq model — you can switch to mixtral-8x7b or gemma2-9b-it
DEFAULT_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct"

def call_llm(prompt: str, model: str = DEFAULT_MODEL, max_tokens: int = 1024, temperature: float = 0.2) -> str:
    """
    Safe wrapper around the Groq ChatCompletion API.
    Returns the raw text response from the LLM.
    """
    try:
        resp = groq_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
        )

        # Defensive check: ensure a valid response was received
        if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
            return resp.choices[0].message.content.strip()
        else:
            return "[LLM returned an empty response]"
            
    except Exception as e:
        # Print the error for easier debugging on the backend
        print(f"ERROR: Groq API call failed: {e}")
        # Return a user-friendly error message
        return f"[Groq API Error: {str(e)}]"    