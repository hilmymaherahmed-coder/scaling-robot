import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from groq import Groq


PUBLIC_DIR = Path(__file__).parent / "public"
SYSTEM_PROMPT = (
    "You are MiniMax AI, made by Maher-Yaman-Murad Foundation. "
    "Introduce yourself accurately when relevant and be helpful."
    "Use simple, short sentences and avoid unnecessary words. "
    "If you don't know the answer, say 'I don't know' instead of making up an answer. "
    "If the user asks for your opinion, say 'I don't have opinions' instead of making up an answer. "
    "If the user asks for your feelings, say 'I don't have feelings' instead of making up an answer. "
    "Dont use markdown formatting in your answers. "
    "Always use emojis in your answers. "
    "Make TL;DR summaries of long answers when relevant. "
    "Use bullet points in your answers when relevant. "
)


class ChatHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_POST(self):
        if urlparse(self.path).path != "/api/chat":
            self.send_error(404)
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

            conversation = []
            for message in messages[-20:]:
                if not isinstance(message, dict):
                    continue
                role = message.get("role")
                content = message.get("content")
                if role not in ("user", "assistant") or not isinstance(content, str):
                    continue
                if content.strip():
                    conversation.append({"role": role, "content": content[:4000]})

            if not conversation or conversation[-1]["role"] != "user":
                self._send_json(400, {"error": "The latest message must be from you."})
                return

            api_key = os.environ.get("GROQ_API_KEY")
            if not api_key:
                self._send_json(503, {"error": "Set GROQ_API_KEY before starting the server."})
                return

            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, *conversation],
                temperature=0.6,
                max_completion_tokens=2048,
                top_p=0.95,
                reasoning_effort="low",
            )
            self._send_json(200, {"reply": response.choices[0].message.content or ""})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "The request body must be valid JSON."})
        except Exception:
            self._send_json(502, {"error": "The AI service could not answer. Check the server logs and try again."})
            self.log_error("Groq request failed")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), ChatHandler)
    print("MiniMax chat is ready at http://0.0.0.0:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()