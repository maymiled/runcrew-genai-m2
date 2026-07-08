const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("message");

function addMessage(role, text, trace) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<div class="role">${role}</div><div class="text"></div>`;
  div.querySelector(".text").textContent = text;
  if (trace && trace.length) {
    const t = document.createElement("div");
    t.className = "trace";
    t.innerHTML = trace
      .map((c, i) => `<span class="step">${i + 1}.</span> ${c.tool}(${JSON.stringify(c.input)})`)
      .join("<br>");
    div.appendChild(t);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage("you", message);
  input.value = "";
  const loading = addMessage("agent", "… reasoning (this can take several tool calls) …");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    loading.remove();
    addMessage("agent", data.reply, data.trace);
  } catch (err) {
    loading.remove();
    addMessage("agent", "Request failed: " + err);
  }
});
