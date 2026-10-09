import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from groq import Groq

PUBLIC_DIR = Path(__file__).parent / "public"

SYSTEM_PROMPT = (
    "You are MiniMax AI, made by Maher-Yaman-Murad Foundation. "
    "Introduce yourself accurately when relevant and be helpful. "
    "Use simple, short sentences and avoid unnecessary words. "
    "If you don't know the answer, say 'I don't know' instead of making up an answer. "
    "If asked for opinions, state that you don't have opinions. "
    "If asked for feelings, state that you don't have feelings. "
    "Use emojis and simple bullet points where appropriate."
)

RESPONSE_LENGTHS = {
    "concise": "Keep the answer concise and focused.",
    "balanced": "Give a balanced answer with enough explanation to be useful.",
    "detailed": "Give a thorough answer with useful context and examples when appropriate.",
}
RESPONSE_STYLES = {
    "smart": "Use a clear, professional tone.",
    "joke": "Use a humorous tone and include jokes when appropriate.",
    "dumb": "Act like the biggest idiot in the world, and even get 1+1 wrong. Use a silly, dumb tone and make up answers when you don't know.",
}
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=API_KEY) if API_KEY else None

class ChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_POST(self):
        if urlparse(self.path).path != "/api/chat":
            self.send_error(404, "Endpoint not found")
            return

        if client is None:
            self._send_json(503, {"error": "Set GROQ_API_KEY before starting the server."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 64_000:
                self._send_json(413, {"error": "Message history is too large."})
                return

            payload = json.loads(self.rfile.read(length))
            messages = payload.get("messages")
            if not isinstance(messages, list) or not messages:
                self._send_json(400, {"error": "Send at least one message."})
                return

            settings = payload.get("settings", {})
            if not isinstance(settings, dict):
                self._send_json(400, {"error": "Chat settings must be an object."})
                return
            response_length = settings.get("response_length", "balanced")
            response_style = settings.get("response_style", "friendly")
            if (
                not isinstance(response_length, str)
                or response_length not in RESPONSE_LENGTHS
                or not isinstance(response_style, str)
                or response_style not in RESPONSE_STYLES
            ):
                self._send_json(400, {"error": "Choose a supported response length and tone."})
                return

            conversation = []
            for message in messages[-20:]:
                if not isinstance(message, dict):
                    continue
                role = message.get("role")
                content = message.get("content")
                if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                    conversation.append({"role": role, "content": content[:4000]})

            if not conversation or conversation[-1]["role"] != "user":
                self._send_json(400, {"error": "The latest message must be from you."})
                return

            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"{SYSTEM_PROMPT} "
                            f"{RESPONSE_LENGTHS[response_length]} "
                            f"{RESPONSE_STYLES[response_style]}"
                        ),
                    },
                    *conversation,
                ],
                temperature=0.6,
                max_completion_tokens=2048,
                top_p=0.95,
                reasoning_effort="low",
            )

            reply = response.choices[0].message.content or ""
            if not reply.strip():
                self._send_json(502, {"error": "The AI service returned an empty response. Try again."})
                return
            self._send_json(200, {"reply": reply})

        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "The request body must be valid JSON."})
        except Exception as e:
            self.log_error("Groq request failed: %s", str(e))
            self._send_json(502, {"error": "The AI service could not answer. Try again later."})

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    host, port = "127.0.0.1", 8080
    server = ThreadingHTTPServer((host, port), ChatHandler)
    print(f"MiniMax chat server running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()